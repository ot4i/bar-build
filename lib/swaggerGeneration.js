/*
Copyright 2020 IBM Corporation
Author Phil Jones

  All rights reserved. This program and the accompanying materials
  are made available under the terms of the MIT License
  which accompanies this distribution, and is available at
  http://opensource.org/licenses/MIT

  Contributors:
      Phil Jones - initial implementation
*/

const YAML = require('js-yaml')

module.exports = class Swagger {
  // TODO: extract swagger nls strings including multiline descriptions- need to work in json and yaml
  constructor (flowDocJson) {
    flowDocJson.integration.name = flowDocJson.integration.name.replace(/ /g, '_')
    this.flowDocument = flowDocJson
    this.swagger = {
      swagger: '2.0',
      info: {
        title: flowDocJson.integration.name,
        version: '0.0.1'
      },
      schemes: ['http', 'https'],
      basePath: '/' + flowDocJson.integration.name,
      consumes: ['application/json'],
      produces: ['application/json'],
      paths: {}
    }
    this._buildSwagger()
  }

  json () {
    return this.swagger
  }

  yaml () {
    return YAML.safeDump(this.swagger)
  }

  flowDoc () {
    return YAML.safeDump(this.flowDocument)
  }

  _buildSwagger () {
    // all models are under trigger interface 1 in an API flow
    const models = this.flowDocument.integration['trigger-interfaces']['trigger-interface-1'].options.resources

    models.forEach(model => {
      const operations = model.triggers
      const modelName = model['business-object']
      this._addModelDefinition(modelName)
      for (const operation in operations) {
        this._addOperation(operation, modelName)
      }
    })

    return this.swagger
  }

  _addOperation (operationName, modelName) {
    switch (operationName) {
      case 'retrieve' :
        return this._addRetrieve(modelName)
      case 'create' :
        return this._addCreate(modelName)
      case 'upsertwithwhere':
        return this._addUpsertWithWhere(modelName)
      case 'replaceorcreate':
        return this._addReplaceOrCreate(modelName)
      case 'retrieveall':
        return this._addRetrieveAll(modelName)
      default:
        return this._addCustom(operationName, modelName)
    }
  }

  _addRetrieveAll (modelName) {
    const path = '/' + modelName
    this._addSwaggerPath(path)

    const operation = {
      tags: [modelName],
      summary: 'Find all instances of the model matched by filter from the data source.',
      operationId: modelName + '.find'
    }

    const parameters = []

    const { 'pagination-type': paginationType, filterSupport } = this.flowDocument.models[modelName].interactions.retrieveall

    if (paginationType === 'SKIP_LIMIT') {
      parameters.push({
        in: 'query',
        name: 'skip',
        required: false,
        type: 'number'
      })

      parameters.push({
        in: 'query',
        name: 'limit',
        required: false,
        type: 'number'
      })
    } else if (paginationType === 'TOKEN_LIMIT') {
      parameters.push({
        in: 'query',
        name: 'token',
        required: false,
        type: 'string'
      })

      parameters.push({
        in: 'query',
        name: 'limit',
        required: false,
        type: 'number'
      })
    }

    if (filterSupport && filterSupport.queryablefields && filterSupport.queryablefields.length > 0) {
      parameters.push({
        in: 'query',
        name: 'filter',
        required: false,
        type: 'string',
        format: 'JSON' // TODO: add the big multi line description
      })

      filterSupport.queryablefields.forEach(field => {
        const type = this._getParameterType(modelName, field)
        const parameter = {
          in: 'query',
          name: field,
          required: false,
          type: type
        }

        if (type === 'date') {
          parameter.type = 'string'
          parameter.format = 'date-time'
        }
        parameters.push(parameter)
      })
    }

    if (parameters.length > 0) {
      operation.parameters = parameters
    }

    const response = {
      description: 'Request was successful',
      schema: {
        type: 'object',
        properties: {
          [modelName]: {
            type: 'array',
            items: {
              $ref: '#/definitions/' + modelName
            }
          }
        }
      }
    }

    if (paginationType === 'SKIP_LIMIT') {
      response.schema.properties.next = {
        type: 'object',
        properties: {
          skip: {
            type: 'number'
          },
          limit: {
            type: 'number'
          }
        }
      }
    } else if (paginationType === 'TOKEN_LIMIT') {
      response.schema.properties.next = {
        type: 'object',
        properties: {
          next_page_token: {
            type: 'string'
          },
          limit: {
            type: 'number'
          }
        }
      }
    }

    operation.responses = {
      200: response
    }

    this.swagger.paths[path].get = operation
  }

  _addCreate (modelName) {
    const path = '/' + modelName
    this._addSwaggerPath(path)

    this.swagger.paths[path].post = {
      tags: [modelName],
      summary: 'Create a new instance of the model and persist it into the data source.',
      operationId: modelName + '.create',
      parameters: [{
        name: 'data',
        in: 'body',
        description: 'Model instance data',
        required: true,
        schema: {
          $ref: '#/definitions/' + modelName
        }
      }],
      responses: {
        201: {
          description: 'Request was successful',
          schema: {
            $ref: '#/definitions/' + modelName
          }
        }
      }
    }
  }

  _addUpsertWithWhere (modelName) {
    const operation = {
      tags: [modelName],
      summary: 'Update an existing model instance or insert a new one into the data source based on the where criteria.',
      operationId: modelName + '.upsertWithWhere',
      responses: {
        200: {
          description: 'Request was successful',
          schema: {
            $ref: '#/definitions/' + modelName
          }
        },
        201: {
          description: 'Request was successful',
          schema: {
            $ref: '#/definitions/' + modelName
          }
        }
      }
    }

    const parameters = [{
      name: 'data',
      in: 'body',
      description: 'An object or model property name/value pairs',
      required: true,
      schema: {
        $ref: '#/definitions/' + modelName
      }
    }]

    const filterSupport = this.flowDocument.models[modelName].interactions.upsertwithwhere.filterSupport

    /* istanbul ignore else */
    if (filterSupport && filterSupport.queryablefields && filterSupport.queryablefields.length > 0) {
      filterSupport.queryablefields.forEach(field => {
        const type = this._getParameterType(modelName, field)
        const parameter = {
          in: 'query',
          name: field,
          required: false,
          type: type
        }

        if (type === 'date') {
          parameter.type = 'string'
          parameter.format = 'date-time'
        }
        parameters.push(parameter)
      })

      parameters.push({ // TODO: add big long description in here
        name: 'where',
        in: 'query',
        required: false,
        type: 'string',
        format: 'JSON'
      })
    }

    operation.parameters = parameters

    this.swagger.paths['/' + modelName + '/upsertWithWhere'] = {
      post: operation
    }
  }

  _addReplaceOrCreate (modelName) {
    const id = this._getId(modelName)
    const path = '/' + modelName + '/{' + id.name + '}'
    this._addSwaggerPath(path)

    this.swagger.paths[path].put = {
      tags: [modelName],
      summary: 'Replace an existing model instance or insert a new one.',
      operationId: modelName + '.patchAttributes',
      parameters: [{
        name: id.name,
        in: 'path',
        description: modelName + ' id',
        required: true,
        type: id.type
      }, {
        name: 'data',
        in: 'body',
        description: 'An object of model property name/value pairs',
        required: true,
        schema: {
          $ref: '#/definitions/' + modelName
        }
      }],
      responses: {
        200: {
          description: 'Request was successful',
          schema: {
            $ref: '#/definitions/' + modelName
          }
        },
        201: {
          description: 'Request was successful',
          schema: {
            $ref: '#/definitions/' + modelName
          }
        }
      }
    }
  }

  _addRetrieve (modelName) {
    const id = this._getId(modelName)

    const path = '/' + modelName + '/{' + id.name + '}'
    this._addSwaggerPath(path)

    this.swagger.paths[path].get = {
      tags: [modelName],
      summary: 'Find a model instance by {{id}} from the data source.',
      operationId: modelName + '.findById',
      parameters: [{
        name: id.name,
        in: 'path',
        description: modelName + ' id',
        required: true,
        type: id.type
      }],
      responses: {
        200: {
          description: 'Request was successful',
          schema: {
            $ref: '#/definitions/' + modelName
          }
        }
      }
    }
  }

  _addCustom (operationName, modelName) {
    const method = this.flowDocument.models[modelName].methods[operationName]
    let verb
    /* istanbul ignore else */
    if (method.http && method.http.verb) {
      verb = method.http.verb.toLowerCase()
    }
    const flowPath = method.http.path
    // The path in the flow is in the format /:name/customget1 which needs to be converted to modelName/{name}/customget1
    const pathList = flowPath.split('/')
    let path = '/' + modelName
    pathList.forEach(function (pathParam) {
      if (pathParam !== '') {
        if (pathParam.startsWith(':')) {
          path = path + '/{' + pathParam.substr(1) + '}'
        } else {
          path = path + '/' + pathParam
        }
      }
    })

    this._addSwaggerPath(path)

    /*
    From
        accepts:
          - arg: name
            type: string
            http:
              source: path
            required: true
          - arg: q1
            type: string
            http:
              source: query

     to
      parameters
        - name: name
          in: path
          required: true
          type: string
        - name: q1
          in: query
          required: false
          type: string
     */
    const parameters = []
    method.accepts.forEach(flowParameter => {
      const swaggerParam = {
        name: flowParameter.arg,
        in: flowParameter.http.source,
        description: modelName + ' ' + flowParameter.arg
      }
      if (flowParameter.http.source === 'body') {
        swaggerParam.schema = {
          $ref: '#/definitions/' + flowParameter.type
        }
        swaggerParam.required = true
      } else {
        swaggerParam.type = flowParameter.type
        swaggerParam.required = flowParameter.required ? flowParameter.required : false
      }
      parameters.push(swaggerParam)
    })

    const responses = {}
    /* istanbul ignore else */
    if (verb === 'get' || verb === 'delete' || verb === 'patch') {
      responses['200'] = {
        description: 'Request was successful',
        schema: {
          $ref: '#/definitions/' + modelName
        }
      }
    } else if (verb === 'put' || verb === 'post') {
      responses['200'] = {
        description: 'Request was successful',
        schema: {
          $ref: '#/definitions/' + modelName
        }
      }
      responses['201'] = {
        description: 'Request was successful',
        schema: {
          $ref: '#/definitions/' + modelName
        }
      }
    } else if (verb === 'head') {
      responses['204'] = {
        description: 'Request was successful'
      }
    }
    this.swagger.paths[path][verb] = {
      tags: [modelName],
      summary: method.description,
      operationId: modelName + '.' + operationName,
      parameters: parameters,
      responses: responses
    }
  }

  _addSwaggerPath (path) {
    if (!this.swagger.paths[path]) {
      this.swagger.paths[path] = {}
    }
  }

  _addModelDefinition (modelName) {
    if (!this.swagger.definitions) {
      this.swagger.definitions = {}
    }

    function getProperty (type) {
      if (Array.isArray(type)) {
        return {
          type: 'array',
          items: getProperty(type[0])
        }
      } else if (typeof type === 'object') {
        return {
          type: 'object',
          properties: getObject(type)
        }
      } else {
        if (type === 'date') {
          return {
            type: 'string',
            format: 'date-time'
          }
        } else {
          return {
            type: type
          }
        }
      }
    }

    function getObject (modelProperties) {
      const properties = {}
      for (const prop in modelProperties) {
        properties[prop] = getProperty(modelProperties[prop].type)
      }
      return properties
    }

    this.swagger.definitions[modelName] = {
      description: '',
      type: 'object',
      properties: getObject(this.flowDocument.models[modelName].properties), // all models are objects
      additionalProperties: false
    }
  }

  _getParameterType (modelName, parameterName) {
    const parameter = this.flowDocument.models[modelName].properties[parameterName]
    /* istanbul ignore else */
    if (parameter) {
      return parameter.type
    } else {
      // All parameters should be at the top level, but in case this ever changes put this in as a safe guard
      return 'string'
    }
  }

  _getId (modelName) {
    const modelProperties = this.flowDocument.models[modelName].properties
    for (const property in modelProperties) {
      if (modelProperties[property].id) {
        return {
          name: property,
          type: modelProperties[property].type // id will always be a primitive type
        }
      }
    }
  }
}
