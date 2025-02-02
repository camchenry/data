import { datatype, name } from 'faker'
import { factory, primaryKey } from '@mswjs/data'
import { OperationErrorType } from '../../src/errors/OperationError'
import { getThrownError } from '../testUtils'

test('updates a unique entity that matches the query', () => {
  const userId = datatype.uuid()
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
      firstName: name.findName,
    },
  })
  db.user.create({
    id: userId,
    firstName: 'Joseph',
  })
  db.user.create()

  const updatedUser = db.user.update({
    where: {
      id: {
        equals: userId,
      },
    },
    data: {
      firstName: 'John',
    },
  })
  expect(updatedUser).toHaveProperty('firstName', 'John')

  const userResult = db.user.findFirst({
    where: {
      id: {
        equals: userId,
      },
    },
  })
  expect(userResult).toHaveProperty('firstName', 'John')
})

test('updates the first entity when multiple entities match the query', () => {
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
      firstName: name.findName,
      followersCount: datatype.number,
    },
  })
  db.user.create({
    firstName: 'Alice',
    followersCount: 10,
  })
  db.user.create({
    followersCount: 12,
  })

  const updatedUser = db.user.update({
    where: {
      followersCount: {
        gte: 10,
      },
    },
    data: {
      firstName: 'Kate',
    },
  })
  expect(updatedUser).toHaveProperty('firstName', 'Kate')

  const kate = db.user.findFirst({
    where: {
      firstName: {
        equals: 'Kate',
      },
    },
  })
  expect(kate).toHaveProperty('firstName', 'Kate')
})

test('throws an exception when no model matches the query in strict mode', () => {
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
      firstName: String,
    },
  })
  db.user.create()
  db.user.create()

  const error = getThrownError(() => {
    db.user.update({
      where: {
        id: {
          equals: 'abc-123',
        },
      },
      data: {
        firstName: 'John',
      },
      strict: true,
    })
  })

  expect(error).toHaveProperty('name', 'OperationError')
  expect(error).toHaveProperty('type', OperationErrorType.EntityNotFound)
  expect(error).toHaveProperty(
    'message',
    'Failed to execute "update" on the "user" model: no entity found matching the query "{"id":{"equals":"abc-123"}}".',
  )
})

test('moves the entity when it updates the primary key', () => {
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
    },
  })

  db.user.create({
    id: 'abc-123',
  })

  const updatedUser = db.user.update({
    where: {
      id: {
        equals: 'abc-123',
      },
    },
    data: {
      id: 'def-456',
    },
  })
  expect(updatedUser).toHaveProperty('id', 'def-456')

  const userResult = db.user.findFirst({
    where: {
      id: {
        equals: 'def-456',
      },
    },
  })
  expect(userResult).toHaveProperty('id', 'def-456')

  const oldUser = db.user.findFirst({
    where: {
      id: {
        equals: 'abc-123',
      },
    },
  })
  expect(oldUser).toBeNull()
})

test('does nothing when no entity matches the query', () => {
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
    },
  })

  db.user.create()
  db.user.create()

  const updatedUser = db.user.update({
    where: {
      id: {
        equals: 'abc-123',
      },
    },
    data: {
      id: 'def-456',
    },
  })
  expect(updatedUser).toBeNull()
})

test('throw an error when trying to update an entity using a key already used', () => {
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
    },
  })

  db.user.create({
    id: '123',
  })
  db.user.create({
    id: '456',
  })

  const error = getThrownError(() => {
    db.user.update({
      where: {
        id: {
          equals: '456',
        },
      },
      data: {
        id: '123',
      },
    })
  })

  expect(error).toHaveProperty('name', 'OperationError')
  expect(error).toHaveProperty('type', OperationErrorType.DuplicatePrimaryKey)
  expect(error).toHaveProperty(
    'message',
    'Failed to execute "update" on the "user" model: the entity with a primary key "123" ("id") already exists.',
  )
})

test('derives next entity values based on the existing ones', () => {
  const db = factory({
    user: {
      id: primaryKey(datatype.uuid),
      firstName: name.findName,
      role: String,
    },
  })

  db.user.create({
    firstName: 'John',
    role: 'Auditor',
  })
  db.user.create({
    firstName: 'Jessie',
    role: 'Writer',
  })

  db.user.update({
    where: {
      role: {
        equals: 'Auditor',
      },
    },
    data: {
      firstName(firstName) {
        return firstName.toUpperCase()
      },
      role(role, user) {
        return user.firstName === 'John' ? 'Writer' : role
      },
    },
  })

  const userResult = db.user.findFirst({
    where: {
      firstName: {
        equals: 'JOHN',
      },
    },
  })
  expect(userResult).toHaveProperty('firstName', 'JOHN')
  expect(userResult).toHaveProperty('role', 'Writer')
})
