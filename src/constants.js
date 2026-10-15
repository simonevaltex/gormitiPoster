// World units are millimetres and milliseconds. Origin = top-left corner of the trimmed A3.

export const A3 = { width: 297, height: 420 };

export const STEP_MS = 1000 / 60;

export const DEFAULTS = {
  bleed: 3,
  strength: 50,
  carta: '#ffffff',
  inchiostro: '#000000',
  spawn: { x: 148.5, y: 80, tilt: 0 },
};

export const DEFAULT_SETTINGS = { restitution: 0.05, friction: 0.8, solidAttractors: true };

export const DEFAULT_SEGMENT = { type: 'segment', x1: 15, y1: 405, x2: 282, y2: 405, strength: 50 };

// a = Σ strength·k / (d² + eps²) in mm/ms². k is calibrated so that a 40 mm block 200 mm from a
// strength-50 point reaches it in about one second (see scripts/calibrate-field.mjs).
export const FIELD = { eps: 20, k: 0.2, maxAccel: 0.002 };

export const PHYS = {
  segmentThickness: 2,
  pointRadius: 1,
  frictionStatic: 1,
  frictionAir: 0.01,
  sleepThreshold: 60,
  positionIterations: 10,
  velocityIterations: 10,
  // PD orientation control, per step: Δω = kp·error − kd·ω, clamped to maxAngAccel.
  kp: 0.01,
  kd: 0.2,
  maxAngAccel: 0.01,
  angleDeadband: 0.003,
  spinDeadband: 0.002,
  // Speed caps (mm/step and rad/step) so that blocks never tunnel through each other.
  vmaxFactor: 0.4,
  vmaxMin: 1.5,
  vmaxMax: 8,
  wmaxMax: 0.1,
  // A block without contacts may not fall asleep while moving faster than this (speed²).
  freeMotionSleep: 1e-4,
  settleMaxSteps: 1200,
  spawnStep: 2,
  spawnMaxTries: 1000,
};

export const EXPORT = { slug: 10, cropMarkWidth: 0.1 };
