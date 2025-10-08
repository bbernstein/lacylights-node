/**
 * Enum types for LacyLights
 *
 * Note: These were previously defined in the Prisma schema as database enums.
 * For SQLite compatibility, we store them as strings in the database but
 * maintain type safety in the application layer.
 */

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum ProjectRole {
  OWNER = 'OWNER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

export enum FixtureType {
  LED_PAR = 'LED_PAR',
  MOVING_HEAD = 'MOVING_HEAD',
  STROBE = 'STROBE',
  DIMMER = 'DIMMER',
  OTHER = 'OTHER',
}

export enum ChannelType {
  INTENSITY = 'INTENSITY',
  RED = 'RED',
  GREEN = 'GREEN',
  BLUE = 'BLUE',
  WHITE = 'WHITE',
  AMBER = 'AMBER',
  UV = 'UV',
  PAN = 'PAN',
  TILT = 'TILT',
  ZOOM = 'ZOOM',
  FOCUS = 'FOCUS',
  IRIS = 'IRIS',
  GOBO = 'GOBO',
  COLOR_WHEEL = 'COLOR_WHEEL',
  EFFECT = 'EFFECT',
  STROBE = 'STROBE',
  MACRO = 'MACRO',
  OTHER = 'OTHER',
}

export enum EasingType {
  LINEAR = 'LINEAR',
  EASE_IN_OUT_CUBIC = 'EASE_IN_OUT_CUBIC',
  EASE_IN_OUT_SINE = 'EASE_IN_OUT_SINE',
  EASE_OUT_EXPONENTIAL = 'EASE_OUT_EXPONENTIAL',
  BEZIER = 'BEZIER',
  S_CURVE = 'S_CURVE',
}

// Type guards for runtime validation

export function isUserRole(value: string): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}

export function isProjectRole(value: string): value is ProjectRole {
  return Object.values(ProjectRole).includes(value as ProjectRole);
}

export function isFixtureType(value: string): value is FixtureType {
  return Object.values(FixtureType).includes(value as FixtureType);
}

export function isChannelType(value: string): value is ChannelType {
  return Object.values(ChannelType).includes(value as ChannelType);
}

export function isEasingType(value: string): value is EasingType {
  return Object.values(EasingType).includes(value as EasingType);
}
