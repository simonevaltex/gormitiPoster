// Matter.js world: attractor colliders, element bodies, the gravitational field and the
// orientation controller. Fixed step only (STEP_MS); no randomness anywhere.
import Matter from 'matter-js';
import { fieldAt, targetAngle, angleDiff } from './field.js';
import { PHYS, STEP_MS } from './constants.js';
import { polygonCentroid, inradius, circumradius } from './geometry.js';

const { Engine, Bodies, Body, Composite, Sleeping, Query, Collision } = Matter;

// Matter's Sleeping.update wakes every body whose `force` is non-zero, and it runs before
// gravity is applied. A field applied with Body.applyForce before Engine.update would keep every
// body awake forever, so the field is plugged into the gravity stage instead (matter-js is
// pinned to an exact version because this hooks an internal function).
if (!Engine._gormitiField) {
  const nativeGravity = Engine._bodiesApplyGravity;
  Engine._bodiesApplyGravity = function applyGravityOrField(bodies, gravity) {
    if (gravity.field) gravity.field(bodies);
    else nativeGravity.call(this, bodies, gravity);
  };
  Engine._gormitiField = true;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createPhysics() {
  let engine = null;
  let settings = null;
  let attractors = [];
  let colliders = [];
  const elementBodies = new Map(); // id → body, in element order

  function applyField(bodies) {
    const dt2 = STEP_MS * STEP_MS;
    for (const body of bodies) {
      if (body.isStatic || body.isSleeping) continue;
      const f = fieldAt(body.position.x, body.position.y, attractors);
      // Acceleration field: force = m·a, so every block falls the same way whatever its size.
      Body.applyForce(body, body.position, { x: f.x * body.mass, y: f.y * body.mass });

      const v = Body.getVelocity(body);
      const speed = Math.hypot(v.x, v.y);
      const vmax = body.plugin.vmax;
      if (speed > vmax) Body.setVelocity(body, { x: (v.x * vmax) / speed, y: (v.y * vmax) / speed });
      let w = Body.getAngularVelocity(body);
      if (Math.abs(w) > body.plugin.wmax) {
        w = Math.sign(w) * body.plugin.wmax;
        Body.setAngularVelocity(body, w);
      }

      // PD control of the angular velocity: local +y turns toward the net force. Blocks align in
      // flight; once touching something the corrective push is weakened, otherwise jammed piles
      // pass the torques around through their contacts and keep sloshing.
      if (f.x === 0 && f.y === 0) continue;
      const err = angleDiff(targetAngle(f.x, f.y), body.angle);
      const touching = body.plugin.touching;
      const deadband = touching ? PHYS.contactAngleDeadband : PHYS.angleDeadband;
      // In contact the push only lasts a while: a block wedged at an angle must be let go to rest.
      // Never on a point: turning a block that sits on the tiny point collider walks it sideways
      // (the contact normal swings from edge to edge), and the radial field holds it anyway.
      const contactScale = body.plugin.touchSteps < PHYS.contactPdSteps && !body.plugin.onPoint ? PHYS.contactPdScale : 0;
      const push = Math.abs(err) < deadband ? 0 : PHYS.kp * err * (touching ? contactScale : 1);
      if (push === 0 && Math.abs(w) < PHYS.spinDeadband) continue;
      const alpha = clamp(push - PHYS.kd * w, -PHYS.maxAngAccel, PHYS.maxAngAccel);
      body.torque += (alpha * body.inertia) / dt2;
    }
  }

  function makeBody(polygon, x, y, angle) {
    const body = Bodies.fromVertices(x, y, [polygon.map((p) => ({ x: p.x, y: p.y }))], {
      friction: settings.friction,
      frictionStatic: PHYS.frictionStatic,
      restitution: settings.restitution,
      frictionAir: PHYS.frictionAir,
      sleepThreshold: PHYS.sleepThreshold,
    });
    Body.setAngle(body, angle);
    const c = polygonCentroid(polygon);
    body.plugin.radius = circumradius(polygon, c);
    body.plugin.vmax = clamp(PHYS.vmaxFactor * inradius(polygon, c), PHYS.vmaxMin, PHYS.vmaxMax);
    body.plugin.wmax = Math.min(PHYS.wmaxMax, body.plugin.vmax / body.plugin.radius);
    body.plugin.touching = false;
    body.plugin.touchSteps = 0;
    body.plugin.frozen = false;
    return body;
  }

  function makeCollider(att) {
    // Matter combines min friction and max restitution per pair: colliders never add bounce.
    const opts = { isStatic: true, friction: settings.friction, frictionStatic: PHYS.frictionStatic, restitution: 0 };
    // Points are frictionless. Matter's friction cancels slow sliding outright (not Coulomb), so
    // any friction would glue a block to a weak point; the radial field needs none to hold it.
    if (att.type === 'point') {
      const point = Bodies.circle(att.x, att.y, PHYS.pointRadius, { ...opts, friction: 0, frictionStatic: 0 }, 16);
      point.plugin.isPoint = true;
      return point;
    }
    const dx = att.x2 - att.x1;
    const dy = att.y2 - att.y1;
    const length = Math.max(Math.hypot(dx, dy), PHYS.segmentThickness);
    return Bodies.rectangle((att.x1 + att.x2) / 2, (att.y1 + att.y2) / 2, length, PHYS.segmentThickness, {
      ...opts,
      angle: Math.atan2(dy, dx),
    });
  }

  function resetColliders() {
    if (colliders.length) Composite.remove(engine.world, colliders);
    colliders = settings.solidAttractors ? attractors.map(makeCollider) : [];
    if (colliders.length) Composite.add(engine.world, colliders);
  }

  // A block that has come to rest becomes a static obstacle ("i blocchi già fermi restano dove
  // sono e fanno da ostacolo"): new blocks cannot shove it, whatever its mass. Changing the field
  // thaws everything so the composition resettles. Body.setStatic keeps the dynamic mass aside.
  function freeze(body) {
    Body.setStatic(body, true);
    body.plugin.frozen = true;
  }

  function thaw(body) {
    if (body.plugin.frozen) Body.setStatic(body, false);
    body.plugin.frozen = false;
    body.plugin.touchSteps = 0;
    Sleeping.set(body, false);
  }

  function wakeAll() {
    for (const body of elementBodies.values()) thaw(body);
  }

  function substep() {
    Engine.update(engine, STEP_MS / PHYS.substeps);
    const touching = new Set();
    const onPoint = new Set();
    for (const pair of engine.pairs.list) {
      if (!pair.isActive || pair.isSensor) continue;
      const a = pair.bodyA.parent;
      const b = pair.bodyB.parent;
      touching.add(a);
      touching.add(b);
      if (a.plugin.isPoint) onPoint.add(b);
      if (b.plugin.isPoint) onPoint.add(a);
    }
    // Matter's sleep test is tuned for pixels and ignores slow rotation (rad/step counts like
    // mm/step), so blocks would freeze half-turned or nap in mid-air in a weak field. Here a
    // body stays awake while it really moves: rotation counts as tip speed (ω·radius).
    for (const body of elementBodies.values()) {
      if (body.plugin.frozen) continue;
      if (body.isSleeping) {
        freeze(body);
        continue;
      }
      body.plugin.touching = touching.has(body);
      body.plugin.onPoint = onPoint.has(body);
      body.plugin.touchSteps = body.plugin.touching ? body.plugin.touchSteps + 1 / PHYS.substeps : 0;
      const v = Body.getVelocity(body);
      const tip = Body.getAngularVelocity(body) * body.plugin.radius;
      const limit = body.plugin.touching ? PHYS.contactMotionSleep : PHYS.freeMotionSleep;
      if (v.x * v.x + v.y * v.y + tip * tip > limit) body.sleepCounter = 0;
    }
  }

  return {
    // Fresh engine: colliders first (attractor order), then elements (element order). An element
    // is frozen unless its state says it was moving (see states()): then it keeps its motion.
    rebuild({ attractors: atts, elements, settings: s }) {
      settings = { ...s };
      attractors = atts.map((a) => ({ ...a }));
      engine = Engine.create({
        enableSleeping: true,
        positionIterations: PHYS.positionIterations,
        velocityIterations: PHYS.velocityIterations,
      });
      engine.gravity.scale = 0;
      engine.gravity.field = applyField;
      elementBodies.clear();
      colliders = [];
      resetColliders();
      for (const el of elements) {
        const body = makeBody(el.polygon, el.x, el.y, el.angle);
        Composite.add(engine.world, body);
        if (el.moving) {
          Body.setVelocity(body, { x: el.vx, y: el.vy });
          Body.setAngularVelocity(body, el.w);
          body.plugin.touchSteps = el.touchSteps;
        } else {
          freeze(body);
        }
        elementBodies.set(el.id, body);
      }
    },

    addElement({ id, polygon, x, y, angle }) {
      const body = makeBody(polygon, x, y, angle);
      Composite.add(engine.world, body);
      elementBodies.set(id, body);
    },

    removeElement(id) {
      const body = elementBodies.get(id);
      if (!body) return;
      Composite.remove(engine.world, body);
      elementBodies.delete(id);
    },

    setAttractors(atts) {
      attractors = atts.map((a) => ({ ...a }));
      resetColliders();
      wakeAll();
    },

    setSettings(s) {
      const solidChanged = s.solidAttractors !== settings.solidAttractors;
      settings = { ...s };
      for (const body of elementBodies.values()) {
        const target = body.plugin.frozen ? body._original : body; // frozen: restored on thaw
        target.friction = settings.friction;
        target.restitution = settings.restitution;
      }
      for (const body of colliders) if (body.friction > 0) body.friction = settings.friction; // segments only
      if (solidChanged) {
        resetColliders();
        wakeAll();
      }
    },

    // One fixed step = PHYS.substeps equal Matter updates, so that no body travels more than a
    // fraction of the 2 mm attractor colliders per update: when an edge passes right through a
    // thin collider, Matter falls back to a single lopsided contact point and the block spins off.
    step() {
      for (let i = 0; i < PHYS.substeps; i++) substep();
    },

    settle(maxSteps = PHYS.settleMaxSteps) {
      let n = 0;
      while (n < maxSteps && !this.isSettled()) {
        this.step();
        n++;
      }
      return n;
    },

    isSettled() {
      for (const body of elementBodies.values()) if (!body.plugin.frozen) return false;
      return true;
    },

    sleepAll() {
      for (const body of elementBodies.values()) if (!body.plugin.frozen) freeze(body);
    },

    wakeAll,

    poses() {
      const out = new Map();
      for (const [id, b] of elementBodies) out.set(id, { x: b.position.x, y: b.position.y, angle: b.angle });
      return out;
    },

    // Full state of every element, moving ones included, so that a rebuild can carry on from
    // exactly here instead of jumping to the resting positions.
    states() {
      const out = {};
      for (const [id, b] of elementBodies) {
        const v = Body.getVelocity(b);
        out[id] = b.plugin.frozen
          ? { x: b.position.x, y: b.position.y, angle: b.angle }
          : { x: b.position.x, y: b.position.y, angle: b.angle, moving: true, vx: v.x, vy: v.y, w: Body.getAngularVelocity(b), touchSteps: b.plugin.touchSteps };
      }
      return out;
    },

    // Moves a probe body back along dir in fixed steps until it overlaps nothing.
    findFreeSpawn(polygon, x, y, angle, dir) {
      const probe = makeBody(polygon, x, y, angle);
      const others = Composite.allBodies(engine.world);
      for (let i = 0; i < PHYS.spawnMaxTries && Query.collides(probe, others).length > 0; i++) {
        Body.setPosition(probe, {
          x: probe.position.x + dir.x * PHYS.spawnStep,
          y: probe.position.y + dir.y * PHYS.spawnStep,
        });
      }
      return { x: probe.position.x, y: probe.position.y };
    },

    overlaps(tolerance = 0.3) {
      const list = [...elementBodies.entries()];
      const out = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const c = Collision.collides(list[i][1], list[j][1]);
          if (c && c.depth > tolerance) out.push([list[i][0], list[j][0], c.depth]);
        }
      }
      return out;
    },
  };
}
