import pluralize from 'pluralize'
import { RestContext, RestRequest, ResponseResolver, rest } from 'msw'
import {
  EntityInstance,
  ModelDictionary,
  ModelAPI,
  PrimaryKeyType,
  ModelDeclaration,
} from '../glossary'
import { GetQueryFor, QuerySelectorWhere } from '../query/queryTypes'
import { OperationErrorType, OperationError } from '../errors/OperationError'
import { removeInternalProperties } from '../utils/removeInternalProperties'
import { findPrimaryKey } from '../utils/findPrimaryKey'

enum HTTPErrorType {
  BadRequest,
}

const ErrorType = { ...HTTPErrorType, ...OperationErrorType }

class HTTPError extends OperationError<HTTPErrorType> {
  constructor(type: HTTPErrorType, message?: string) {
    super(type, message)
    this.name = 'HTTPError'
  }
}

interface WeakQuerySelectorWhere<KeyType extends PrimaryKeyType> {
  [key: string]: Partial<GetQueryFor<KeyType>>
}

type RequestParams<Key extends PrimaryKeyType> = {
  [K in Key]: PrimaryKeyType
}

export function createUrlBuilder(baseUrl?: string) {
  return (path: string) => {
    const url = new URL(path, baseUrl || 'http://localhost')
    return baseUrl ? url.toString() : url.pathname
  }
}

export function getResponseStatusByErrorType(
  error: OperationError | HTTPError,
): number {
  switch (error.type) {
    case ErrorType.EntityNotFound:
      return 404
    case ErrorType.DuplicatePrimaryKey:
      return 409
    case ErrorType.BadRequest:
      return 400
    default:
      return 500
  }
}

export function withErrors<RequestBodyType = any, RequestParamsType = any>(
  handler: ResponseResolver<
    RestRequest<RequestBodyType, RequestParamsType>,
    RestContext
  >,
): ResponseResolver<
  RestRequest<RequestBodyType, RequestParamsType>,
  RestContext
> {
  return (req, res, ctx) => {
    try {
      return handler(req, res, ctx)
    } catch (error) {
      return res(
        ctx.status(getResponseStatusByErrorType(error)),
        ctx.json({
          message: error.message,
        }),
      )
    }
  }
}

function getFilters<ModelName extends string>(
  modelName: ModelName,
  declaration: ModelDeclaration,
  searchParams: URLSearchParams,
): QuerySelectorWhere<any> {
  const paginationKeys = ['cursor', 'skip', 'take']
  const filters: QuerySelectorWhere<any> = {}
  searchParams.forEach((value, key) => {
    if (paginationKeys.includes(key)) return
    if (declaration[key]) {
      filters[key] = {
        equals: value,
      }
    } else {
      throw new HTTPError(
        HTTPErrorType.BadRequest,
        `Failed to query the "${modelName}" model: unknown property "${key}".`,
      )
    }
  })
  return filters
}

export function generateRestHandlers<
  Dictionary extends ModelDictionary,
  ModelName extends string
>(
  modelName: ModelName,
  modelDeclaration: ModelDeclaration,
  model: ModelAPI<Dictionary, ModelName>,
  baseUrl: string = '',
) {
  const primaryKey = findPrimaryKey(modelDeclaration)!
  const modelPath = pluralize(modelName)
  const buildUrl = createUrlBuilder(baseUrl)

  return [
    rest.get(
      buildUrl(modelPath),
      withErrors<EntityInstance<Dictionary, ModelName>>((req, res, ctx) => {
        const cursor = req.url.searchParams.get('cursor')
        const rawSkip = req.url.searchParams.get('skip')
        const rawTake = req.url.searchParams.get('take')

        const filters = getFilters(
          modelName,
          modelDeclaration,
          req.url.searchParams,
        )

        const skip = parseInt(rawSkip ?? '0', 10)
        const take = rawTake == null ? rawTake : parseInt(rawTake, 10)

        let options = { where: filters }
        if (take && !isNaN(take) && !isNaN(skip)) {
          options = Object.assign(options, { take, skip })
        }
        if (take && !isNaN(take) && cursor) {
          options = Object.assign(options, { take, cursor })
        }

        const records = model.findMany(options)

        return res(ctx.json(records.map(removeInternalProperties)))
      }),
    ),
    rest.get(
      buildUrl(`${modelPath}/:${primaryKey}`),
      withErrors<
        EntityInstance<Dictionary, ModelName>,
        RequestParams<PrimaryKeyType>
      >((req, res, ctx) => {
        const id = req.params[primaryKey]
        const where: WeakQuerySelectorWhere<typeof primaryKey> = {
          [primaryKey]: {
            equals: id,
          },
        }
        const entity = model.findFirst({
          strict: true,
          where: where as any,
        })

        return res(ctx.json(removeInternalProperties(entity)))
      }),
    ),
    rest.post(
      buildUrl(modelPath),
      withErrors<EntityInstance<Dictionary, ModelName>>((req, res, ctx) => {
        const createdEntity = model.create(req.body)
        return res(
          ctx.status(201),
          ctx.json(removeInternalProperties(createdEntity)),
        )
      }),
    ),
    rest.put(
      buildUrl(`${modelPath}/:${primaryKey}`),
      withErrors<
        EntityInstance<Dictionary, ModelName>,
        RequestParams<PrimaryKeyType>
      >((req, res, ctx) => {
        const id = req.params[primaryKey]
        const where: WeakQuerySelectorWhere<typeof primaryKey> = {
          [primaryKey]: {
            equals: id,
          },
        }
        const updatedEntity = model.update({
          strict: true,
          where: where as any,
          data: req.body,
        })!

        return res(ctx.json(removeInternalProperties(updatedEntity)))
      }),
    ),
    rest.delete(
      buildUrl(`${modelPath}/:${primaryKey}`),
      withErrors<
        EntityInstance<Dictionary, ModelName>,
        RequestParams<PrimaryKeyType>
      >((req, res, ctx) => {
        const id = req.params[primaryKey]
        const where: WeakQuerySelectorWhere<typeof primaryKey> = {
          [primaryKey]: {
            equals: id,
          },
        }
        const deletedEntity = model.delete({
          strict: true,
          where: where as any,
        })!

        return res(ctx.json(removeInternalProperties(deletedEntity)))
      }),
    ),
  ]
}
