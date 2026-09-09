import { Either, Left, Right } from 'purify-ts/Either'

export type Coordinate = {
  readonly lng: number
  readonly lat: number
}

export type ValidationError = { readonly kind: 'InvalidCoordinate'; readonly message: string }

export const coordinate = (lng: number, lat: number): Either<ValidationError, Coordinate> => {
  if (lng < -180 || lng > 180) {
    return Left({ kind: 'InvalidCoordinate', message: `Longitude ${lng} out of range [-180, 180]` })
  }
  if (lat < -90 || lat > 90) {
    return Left({ kind: 'InvalidCoordinate', message: `Latitude ${lat} out of range [-90, 90]` })
  }
  return Right({ lng, lat })
}
