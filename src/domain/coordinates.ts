export type Coordinate = {
  readonly lng: number
  readonly lat: number
}

export type ValidationError = { readonly kind: 'InvalidCoordinate'; readonly message: string }
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ValidationError }

export const coordinate = (lng: number, lat: number): Result<Coordinate> => {
  if (lng < -180 || lng > 180) {
    return { ok: false, error: { kind: 'InvalidCoordinate', message: `Longitude ${lng} out of range [-180, 180]` } }
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, error: { kind: 'InvalidCoordinate', message: `Latitude ${lat} out of range [-90, 90]` } }
  }
  return { ok: true, value: { lng, lat } }
}
