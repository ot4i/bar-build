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

const expect = require('chai').expect
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const fs = require('fs')
const path = require('path')
const YAML = require('js-yaml')
const swaggerParser = require('swagger-parser')

const Swagger = require('../../lib/swaggerGeneration')

describe('swaggerGeneration', function () {
  describe('Swagger as object', function () {
    let swaggerJSON
    let swaggerYAML
    let ultimateFlow
    before(function () {
      ultimateFlow = YAML.safeLoad(fs.readFileSync(path.join(__dirname, 'test_files', 'Ultimate Flow.yaml')))
      const swagger = new Swagger(ultimateFlow)
      swaggerJSON = swagger.json()
      swaggerYAML = swagger.yaml()
    })

    describe('Basic tests', function () {
      it('produces a v2 swagger', function () {
        expect(swaggerJSON).to.have.property('swagger', '2.0')
      })

      it('includes an info object where the flow name has had spaces replaced with underscores', function () {
        // NOTE: This algorithm is also used for validation in the UI.
        // Do not change the algorithm here without consulting Suhr and Jet and making a matching change in the UI
        expect(swaggerJSON).to.have.property('info')
        expect(swaggerJSON.info).to.have.property('title', 'Ultimate_Flow')
        expect(swaggerJSON.info).to.have.property('version', '0.0.1')
      })

      it('adds http and https to the schemes', function () {
        expect(swaggerJSON).to.have.property('schemes')
        expect(swaggerJSON.schemes).to.have.members(['http', 'https'])
      })

      it('has a base path that is the same as the flow name', function () {
        expect(swaggerJSON).to.have.property('basePath', '/Ultimate_Flow')
      })

      it('consumes and produces application/json', function () {
        expect(swaggerJSON).to.have.property('consumes')
        expect(swaggerJSON.consumes).to.have.members(['application/json'])
        expect(swaggerJSON).to.have.property('produces')
        expect(swaggerJSON.produces).to.have.members(['application/json'])
      })
    })

    describe('Whole document comparison', function () {
      let expectedYaml
      before(function () {
        expectedYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'Ultimate Flow Swagger.yaml'), 'utf-8')

        // Windows adds line separators \r\n instead of just \n. Remove the \r to allow the documents to match
        expectedYaml = expectedYaml.replace(/[\r]/g, '')
      })

      it('matches the expected YAML document', function () {
        expect(swaggerYAML).to.equal(expectedYaml)
      })

      context('produces valid swagger', function () {
        // Create new swagger object to avoid the validation rewriting the object being tests
        let swaggerToValidateJson
        beforeEach(function () {
          const swaggerToValidate = new Swagger(ultimateFlow)
          swaggerToValidateJson = swaggerToValidate.json()
        })
        it('the swagger can be validated', function () {
          return expect(swaggerParser.validate(swaggerToValidateJson)).to.eventually.be.fulfilled
            .then(api => {
              expect(api.info.title).to.deep.equal(swaggerToValidateJson.info.title)
            })
        })
      })
    })

    describe('Operations', function () {
      context('create', function () {
        let create
        before(function () {
          create = swaggerJSON.paths['/model1'].post
        })

        it('has the model name as a tag', function () {
          expect(create.tags).to.deep.equal(['model1'])
        })

        it('has the correct operation id', function () {
          expect(create).to.have.property('operationId', 'model1.create')
        })

        it('only expects the model in the body as a required input parameter', function () {
          expect(create.parameters).to.have.length(1)
          expect(create.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'Model instance data',
            required: true,
            schema: {
              $ref: '#/definitions/model1'
            }
          })
        })

        it('has a 201 response containing the model', function () {
          expect(create.responses).to.deep.equal({
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
        })
      })

      context('retrieve', function () {
        let retrieve1
        let retrieve2

        before(function () {
          retrieve1 = swaggerJSON.paths['/model1/{string_property}'].get
          retrieve2 = swaggerJSON.paths['/model2/{number_property}'].get
        })

        it('has the model name as a tag', function () {
          expect(retrieve1.tags).to.deep.equal(['model1'])
          expect(retrieve2.tags).to.deep.equal(['model2'])
        })

        it('has the correct operation id', function () {
          expect(retrieve1).to.have.property('operationId', 'model1.findById')
          expect(retrieve2).to.have.property('operationId', 'model2.findById')
        })

        it('has only the id property as a required input path parameter of the correct type', function () {
          expect(retrieve1.parameters).to.have.length(1)
          expect(retrieve1.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model1 id',
            required: true,
            type: 'string'
          })
          expect(retrieve2.parameters).to.have.length(1)
          expect(retrieve2.parameters[0]).to.deep.equal({
            name: 'number_property',
            in: 'path',
            description: 'model2 id',
            required: true,
            type: 'number'
          })
        })

        it('has a 200 response containing the model', function () {
          expect(retrieve1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
          expect(retrieve2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
        })
      })

      context('retrieveall', function () {
        context('no pagination, no query parameters', function () {
          let retrieveAll
          before(function () {
            retrieveAll = swaggerJSON.paths['/model1'].get
          })

          it('has the model name as a tag', function () {
            expect(retrieveAll.tags).to.deep.equal(['model1'])
          })

          it('has the correct operation id', function () {
            expect(retrieveAll).to.have.property('operationId', 'model1.find')
          })

          it('has no input parameters', function () {
            expect(retrieveAll.parameters).to.equal(undefined)
          })

          it('has a 200 response containing an array of the model', function () {
            expect(retrieveAll.responses).to.deep.equal({
              200: {
                description: 'Request was successful',
                schema: {
                  type: 'object',
                  properties: {
                    model1: {
                      type: 'array',
                      items: {
                        $ref: '#/definitions/model1'
                      }
                    }
                  }
                }
              }
            })
          })
        })

        context('skip limit pagination, string, date and boolean query parameters', function () {
          let retrieveAll
          before(function () {
            retrieveAll = swaggerJSON.paths['/model2'].get
          })

          it('has the model name as a tag', function () {
            expect(retrieveAll.tags).to.deep.equal(['model2'])
          })

          it('has the correct operation id', function () {
            expect(retrieveAll).to.have.property('operationId', 'model2.find')
          })

          it('has skip and limit query parameters', function () {
            expect(retrieveAll.parameters).to.deep.include.members([{
              name: 'skip',
              in: 'query',
              required: false,
              type: 'number'
            }, {
              name: 'limit',
              in: 'query',
              required: false,
              type: 'number'
            }])
          })

          it('has string, date and boolean query parameters', function () {
            expect(retrieveAll.parameters).to.deep.include.members([{
              name: 'string_property',
              in: 'query',
              required: false,
              type: 'string'
            }, {
              name: 'date_property',
              in: 'query',
              required: false,
              type: 'string',
              format: 'date-time'
            }, {
              name: 'boolean_property',
              in: 'query',
              required: false,
              type: 'boolean'
            }])
          })

          it('has a filter query parameter', function () {
            expect(retrieveAll.parameters).to.deep.include.members([{
              name: 'filter',
              in: 'query',
              required: false,
              type: 'string',
              format: 'JSON'
            }])
          })

          it('has a 200 response containing an array of the model and a next object', function () {
            expect(retrieveAll.responses).to.deep.equal({
              200: {
                description: 'Request was successful',
                schema: {
                  type: 'object',
                  properties: {
                    model2: {
                      type: 'array',
                      items: {
                        $ref: '#/definitions/model2'
                      }
                    },
                    next: {
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
                  }
                }
              }
            })
          })
        })

        context('token limit pagination, number, date and boolean query parameters', function () {
          let retrieveAll
          before(function () {
            retrieveAll = swaggerJSON.paths['/model3'].get
          })

          it('has the model name as a tag', function () {
            expect(retrieveAll.tags).to.deep.equal(['model3'])
          })

          it('has the correct operation id', function () {
            expect(retrieveAll).to.have.property('operationId', 'model3.find')
          })

          it('has skip and limit query parameters', function () {
            expect(retrieveAll.parameters).to.deep.include.members([{
              name: 'token',
              in: 'query',
              required: false,
              type: 'string'
            }, {
              name: 'limit',
              in: 'query',
              required: false,
              type: 'number'
            }])
          })

          it('has string, date and boolean query parameters', function () {
            expect(retrieveAll.parameters).to.deep.include.members([{
              name: 'number_property',
              in: 'query',
              required: false,
              type: 'number'
            }, {
              name: 'date_property',
              in: 'query',
              required: false,
              type: 'string',
              format: 'date-time'
            }, {
              name: 'boolean_property',
              in: 'query',
              required: false,
              type: 'boolean'
            }])
          })

          it('has a filter query parameter', function () {
            expect(retrieveAll.parameters).to.deep.include.members([{
              name: 'filter',
              in: 'query',
              required: false,
              type: 'string',
              format: 'JSON'
            }])
          })

          it('has a 200 response containing an array of the model and a next object', function () {
            expect(retrieveAll.responses).to.deep.equal({
              200: {
                description: 'Request was successful',
                schema: {
                  type: 'object',
                  properties: {
                    model3: {
                      type: 'array',
                      items: {
                        $ref: '#/definitions/model3'
                      }
                    },
                    next: {
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
                }
              }
            })
          })
        })
      })

      context('upsertWithWhere', function () {
        context('no query parameters', function () {
          let upsertWithWhere
          before(function () {
            upsertWithWhere = swaggerJSON.paths['/model1/upsertWithWhere'].post
          })

          it('has the model name as a tag', function () {
            expect(upsertWithWhere.tags).to.deep.equal(['model1'])
          })

          it('has the correct operation id', function () {
            expect(upsertWithWhere).to.have.property('operationId', 'model1.upsertWithWhere')
          })

          it('has a body parameter', function () {
            expect(upsertWithWhere.parameters).to.deep.equal([{
              name: 'data',
              in: 'body',
              description: 'An object or model property name/value pairs',
              required: true,
              schema: {
                $ref: '#/definitions/model1'
              }
            }])
          })

          it('has a 200 or 201 response containing the model', function () {
            expect(upsertWithWhere.responses).to.deep.equal({
              200: {
                description: 'Request was successful',
                schema: {
                  $ref: '#/definitions/model1'
                }
              },
              201: {
                description: 'Request was successful',
                schema: {
                  $ref: '#/definitions/model1'
                }
              }
            })
          })
        })

        context('string, date and boolean query parameters', function () {
          let upsertWithWhere
          before(function () {
            upsertWithWhere = swaggerJSON.paths['/model2/upsertWithWhere'].post
          })

          it('has the model name as a tag', function () {
            expect(upsertWithWhere.tags).to.deep.equal(['model2'])
          })

          it('has the correct operation id', function () {
            expect(upsertWithWhere).to.have.property('operationId', 'model2.upsertWithWhere')
          })

          it('has string, date and boolean query parameters', function () {
            expect(upsertWithWhere.parameters).to.deep.include.members([{
              name: 'string_property',
              in: 'query',
              required: false,
              type: 'string'
            }, {
              name: 'date_property',
              in: 'query',
              required: false,
              type: 'string',
              format: 'date-time'
            }, {
              name: 'boolean_property',
              in: 'query',
              required: false,
              type: 'boolean'
            }])
          })

          it('has a where query parameter', function () {
            expect(upsertWithWhere.parameters).to.deep.include.members([{
              name: 'where',
              in: 'query',
              required: false,
              type: 'string',
              format: 'JSON'
            }])
          })

          it('has a body parameter', function () {
            expect(upsertWithWhere.parameters).to.deep.include.members([{
              name: 'data',
              in: 'body',
              description: 'An object or model property name/value pairs',
              required: true,
              schema: {
                $ref: '#/definitions/model2'
              }
            }])
          })

          it('has a 200 or 201 response containing the model', function () {
            expect(upsertWithWhere.responses).to.deep.equal({
              200: {
                description: 'Request was successful',
                schema: {
                  $ref: '#/definitions/model2'
                }
              },
              201: {
                description: 'Request was successful',
                schema: {
                  $ref: '#/definitions/model2'
                }
              }
            })
          })
        })

        context('number, date and boolean query parameters', function () {
          let upsertWithWhere
          before(function () {
            upsertWithWhere = swaggerJSON.paths['/model3/upsertWithWhere'].post
          })

          it('has the model name as a tag', function () {
            expect(upsertWithWhere.tags).to.deep.equal(['model3'])
          })

          it('has the correct operation id', function () {
            expect(upsertWithWhere).to.have.property('operationId', 'model3.upsertWithWhere')
          })

          it('has number, date and boolean query parameters', function () {
            expect(upsertWithWhere.parameters).to.deep.include.members([{
              name: 'number_property',
              in: 'query',
              required: false,
              type: 'number'
            }, {
              name: 'date_property',
              in: 'query',
              required: false,
              type: 'string',
              format: 'date-time'
            }, {
              name: 'boolean_property',
              in: 'query',
              required: false,
              type: 'boolean'
            }])
          })

          it('has a where query parameter', function () {
            expect(upsertWithWhere.parameters).to.deep.include.members([{
              name: 'where',
              in: 'query',
              required: false,
              type: 'string',
              format: 'JSON'
            }])
          })

          it('has a body parameter', function () {
            expect(upsertWithWhere.parameters).to.deep.include.members([{
              name: 'data',
              in: 'body',
              description: 'An object or model property name/value pairs',
              required: true,
              schema: {
                $ref: '#/definitions/model3'
              }
            }])
          })

          it('has a 200 or 201 response containing the model', function () {
            expect(upsertWithWhere.responses).to.deep.equal({
              200: {
                description: 'Request was successful',
                schema: {
                  $ref: '#/definitions/model3'
                }
              },
              201: {
                description: 'Request was successful',
                schema: {
                  $ref: '#/definitions/model3'
                }
              }
            })
          })
        })
      })

      context('replaceorcreate', function () {
        let replaceorcreate1
        let replaceorcreate2

        before(function () {
          replaceorcreate1 = swaggerJSON.paths['/model1/{string_property}'].put
          replaceorcreate2 = swaggerJSON.paths['/model2/{number_property}'].put
        })

        it('has the model name as a tag', function () {
          expect(replaceorcreate1.tags).to.deep.equal(['model1'])
          expect(replaceorcreate2.tags).to.deep.equal(['model2'])
        })

        it('has the correct operation id', function () {
          expect(replaceorcreate1).to.have.property('operationId', 'model1.patchAttributes')
          expect(replaceorcreate2).to.have.property('operationId', 'model2.patchAttributes')
        })

        // TODO: add model and test where the id is a number
        it('has the model as a required body parameter and id property as a required path parameter ', function () {
          expect(replaceorcreate1.parameters).to.have.length(2)
          expect(replaceorcreate1.parameters).to.deep.equal([{
            name: 'string_property',
            in: 'path',
            description: 'model1 id',
            required: true,
            type: 'string'
          }, {
            name: 'data',
            in: 'body',
            description: 'An object of model property name/value pairs',
            required: true,
            schema: {
              $ref: '#/definitions/model1'
            }
          }])
          expect(replaceorcreate2.parameters).to.have.length(2)
          expect(replaceorcreate2.parameters).to.deep.equal([{
            name: 'number_property',
            in: 'path',
            description: 'model2 id',
            required: true,
            type: 'number'
          }, {
            name: 'data',
            in: 'body',
            description: 'An object of model property name/value pairs',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          }])
        })

        it('has a 200 and 201 response containing the model', function () {
          expect(replaceorcreate1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
          expect(replaceorcreate2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
        })
      })
    })

    describe('LB Model to JSON schema conversion', function () {
      it('defined models as an object with additional properties false', function () {
        expect(swaggerJSON.definitions.model1).to.have.property('type', 'object')
        expect(swaggerJSON.definitions.model1).to.have.property('additionalProperties', false)
      })

      it('handles top level string primitive types', function () {
        expect(swaggerJSON.definitions.model1.properties).to.deep.include({
          string_property: {
            type: 'string'
          },
          number_property: {
            type: 'number'
          },
          boolean_property: {
            type: 'boolean'
          },
          date_property: {
            type: 'string',
            format: 'date-time'
          }
        })
      })

      it('handles objects with no defined properties', function () {
        expect(swaggerJSON.definitions.model1.properties).to.deep.include({
          empty_object_property: {
            type: 'object',
            properties: {}
          }
        })
      })

      it('handles objects with primitive types as properties', function () {
        expect(swaggerJSON.definitions.model1.properties.object_property.properties).to.deep.include({
          nested_number_property: {
            type: 'number'
          },
          nested_date_property: {
            type: 'string',
            format: 'date-time'
          }
        })
      })

      it('handles objects with objects as properties', function () {
        expect(swaggerJSON.definitions.model1.properties.object_property.properties).to.deep.include({
          nested_object_property: {
            type: 'object',
            properties: {
              nested_string_property: {
                type: 'string'
              }
            }
          }
        })
      })

      it('handles top level and nested arrays, with primitive and complex types as items', function () {
        expect(swaggerJSON.definitions.model1.properties).to.deep.include({
          array_property: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nested_array_property: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                }
              }
            }
          }
        })
      })
    })

    context('custom operations', function () {
      context('Check get paths', function () {
        let customget1
        let customget2
        let customget3
        let customget4
        before(function () {
          customget1 = swaggerJSON.paths['/model3/{string_property}/customget1'].get
          customget2 = swaggerJSON.paths['/model3/{string_property}/customget2'].get
          customget3 = swaggerJSON.paths['/model3/customget3'].get
          customget4 = swaggerJSON.paths['/model3/customget4'].get
        })

        it('has the model name as a tag', function () {
          expect(customget1.tags).to.deep.equal(['model3'])
          expect(customget2.tags).to.deep.equal(['model3'])
          expect(customget3.tags).to.deep.equal(['model3'])
          expect(customget4.tags).to.deep.equal(['model3'])
        })

        it('has the correct operation id', function () {
          expect(customget1).to.have.property('operationId', 'model3.customget1')
          expect(customget2).to.have.property('operationId', 'model3.customget2')
          expect(customget3).to.have.property('operationId', 'model3.customget3')
          expect(customget4).to.have.property('operationId', 'model3.customget4')
        })

        it('has only the id property as a required input path parameter of the correct type', function () {
          expect(customget1.parameters).to.have.length(2)
          expect(customget1.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model3 string_property',
            required: true,
            type: 'string'
          })
          expect(customget1.parameters[1]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model3 q1',
            required: false,
            type: 'string'
          })

          expect(customget2.parameters).to.have.length(1)
          expect(customget2.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model3 string_property',
            required: true,
            type: 'string'
          })

          expect(customget3.parameters).to.have.length(0)

          expect(customget4.parameters).to.have.length(1)
          expect(customget4.parameters[0]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model3 q1',
            required: false,
            type: 'string'
          })
        })

        it('has a 200 response containing the model', function () {
          expect(customget1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
          expect(customget2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
          expect(customget3.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
          expect(customget4.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
        })
      })

      context('Check post paths', function () {
        let custompost1
        let custompost2
        let custompost3
        let custompost4
        before(function () {
          custompost1 = swaggerJSON.paths['/model2/{number_property}/custompost1'].post
          custompost2 = swaggerJSON.paths['/model2/{number_property}/custompost2'].post
          custompost3 = swaggerJSON.paths['/model2/custompost3'].post
          custompost4 = swaggerJSON.paths['/model2/custompost4'].post
        })

        it('has the model name as a tag', function () {
          expect(custompost1.tags).to.deep.equal(['model2'])
          expect(custompost2.tags).to.deep.equal(['model2'])
          expect(custompost3.tags).to.deep.equal(['model2'])
          expect(custompost4.tags).to.deep.equal(['model2'])
        })

        it('has the correct operation id', function () {
          expect(custompost1).to.have.property('operationId', 'model2.custompost1')
          expect(custompost2).to.have.property('operationId', 'model2.custompost2')
          expect(custompost3).to.have.property('operationId', 'model2.custompost3')
          expect(custompost4).to.have.property('operationId', 'model2.custompost4')
        })

        it('has the correct properties defined', function () {
          expect(custompost1.parameters).to.have.length(4)
          expect(custompost1.parameters[0]).to.deep.equal({
            name: 'number_property',
            in: 'path',
            description: 'model2 number_property',
            required: true,
            type: 'string'
          })
          expect(custompost1.parameters[1]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })
          expect(custompost1.parameters[2]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model2 q1',
            required: false,
            type: 'string'
          })
          expect(custompost1.parameters[3]).to.deep.equal({
            name: 'q2',
            in: 'query',
            description: 'model2 q2',
            required: false,
            type: 'string'
          })

          expect(custompost2.parameters).to.have.length(2)
          expect(custompost2.parameters[0]).to.deep.equal({
            name: 'number_property',
            in: 'path',
            description: 'model2 number_property',
            required: true,
            type: 'string'
          })
          expect(custompost2.parameters[1]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })

          expect(custompost3.parameters).to.have.length(2)
          expect(custompost3.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })
          expect(custompost3.parameters[1]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model2 q1',
            required: false,
            type: 'string'
          })

          expect(custompost4.parameters).to.have.length(1)
          expect(custompost4.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })
        })

        it('has a 200 response containing the model', function () {
          expect(custompost1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
          expect(custompost2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
          expect(custompost3.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
          expect(custompost4.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
        })
      })

      context('Check put paths', function () {
        let customput1
        let customput2
        let customput3
        let customput4
        before(function () {
          customput1 = swaggerJSON.paths['/model1/{string_property}/customput1'].put
          customput2 = swaggerJSON.paths['/model1/{string_property}/customput2'].put
          customput3 = swaggerJSON.paths['/model1/customput3'].put
          customput4 = swaggerJSON.paths['/model1/customput4'].put
        })

        it('has the model name as a tag', function () {
          expect(customput1.tags).to.deep.equal(['model1'])
          expect(customput2.tags).to.deep.equal(['model1'])
          expect(customput3.tags).to.deep.equal(['model1'])
          expect(customput4.tags).to.deep.equal(['model1'])
        })

        it('has the correct operation id', function () {
          expect(customput1).to.have.property('operationId', 'model1.customput1')
          expect(customput2).to.have.property('operationId', 'model1.customput2')
          expect(customput3).to.have.property('operationId', 'model1.customput3')
          expect(customput4).to.have.property('operationId', 'model1.customput4')
        })

        it('has the correct properties defined', function () {
          expect(customput1.parameters).to.have.length(4)
          expect(customput1.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model1 string_property',
            required: true,
            type: 'string'
          })
          expect(customput1.parameters[1]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model1 data',
            required: true,
            schema: {
              $ref: '#/definitions/model1'
            }
          })
          expect(customput1.parameters[2]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model1 q1',
            required: false,
            type: 'string'
          })
          expect(customput1.parameters[3]).to.deep.equal({
            name: 'q2',
            in: 'query',
            description: 'model1 q2',
            required: false,
            type: 'string'
          })

          expect(customput2.parameters).to.have.length(2)
          expect(customput2.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model1 string_property',
            required: true,
            type: 'string'
          })
          expect(customput2.parameters[1]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model1 data',
            required: true,
            schema: {
              $ref: '#/definitions/model1'
            }
          })

          expect(customput3.parameters).to.have.length(2)
          expect(customput3.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model1 data',
            required: true,
            schema: {
              $ref: '#/definitions/model1'
            }
          })
          expect(customput3.parameters[1]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model1 q1',
            required: false,
            type: 'string'
          })

          expect(customput4.parameters).to.have.length(1)
          expect(customput4.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model1 data',
            required: true,
            schema: {
              $ref: '#/definitions/model1'
            }
          })
        })

        it('has a 200 response containing the model', function () {
          expect(customput1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
          expect(customput2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
          expect(customput3.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
          expect(customput4.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            },
            201: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model1'
              }
            }
          })
        })
      })

      context('Check delete paths', function () {
        let customdelete1
        let customdelete2
        let customdelete3
        let customdelete4
        before(function () {
          customdelete1 = swaggerJSON.paths['/model3/{string_property}/customdelete1'].delete
          customdelete2 = swaggerJSON.paths['/model3/{string_property}/customdelete2'].delete
          customdelete3 = swaggerJSON.paths['/model3/customdelete3'].delete
          customdelete4 = swaggerJSON.paths['/model3/customdelete4'].delete
        })

        it('has the model name as a tag', function () {
          expect(customdelete1.tags).to.deep.equal(['model3'])
          expect(customdelete2.tags).to.deep.equal(['model3'])
          expect(customdelete3.tags).to.deep.equal(['model3'])
          expect(customdelete4.tags).to.deep.equal(['model3'])
        })

        it('has the correct operation id', function () {
          expect(customdelete1).to.have.property('operationId', 'model3.customdelete1')
          expect(customdelete2).to.have.property('operationId', 'model3.customdelete2')
          expect(customdelete3).to.have.property('operationId', 'model3.customdelete3')
          expect(customdelete4).to.have.property('operationId', 'model3.customdelete4')
        })

        it('has only the id property as a required input path parameter of the correct type', function () {
          expect(customdelete1.parameters).to.have.length(2)
          expect(customdelete1.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model3 string_property',
            required: true,
            type: 'string'
          })
          expect(customdelete1.parameters[1]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model3 q1',
            required: false,
            type: 'string'
          })

          expect(customdelete2.parameters).to.have.length(1)
          expect(customdelete2.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model3 string_property',
            required: true,
            type: 'string'
          })

          expect(customdelete3.parameters).to.have.length(1)
          expect(customdelete3.parameters[0]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model3 q1',
            required: false,
            type: 'string'
          })

          expect(customdelete4.parameters).to.have.length(0)
        })

        it('has a 200 response containing the model', function () {
          expect(customdelete1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
          expect(customdelete2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
          expect(customdelete3.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
          expect(customdelete4.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model3'
              }
            }
          })
        })
      })

      context('Check patch paths', function () {
        let custompatch1
        let custompatch2
        let custompatch3
        let custompatch4
        before(function () {
          custompatch1 = swaggerJSON.paths['/model2/{number_property}/custompatch1'].patch
          custompatch2 = swaggerJSON.paths['/model2/{number_property}/custompatch2'].patch
          custompatch3 = swaggerJSON.paths['/model2/custompatch3'].patch
          custompatch4 = swaggerJSON.paths['/model2/custompatch4'].patch
        })

        it('has the model name as a tag', function () {
          expect(custompatch1.tags).to.deep.equal(['model2'])
          expect(custompatch2.tags).to.deep.equal(['model2'])
          expect(custompatch3.tags).to.deep.equal(['model2'])
          expect(custompatch4.tags).to.deep.equal(['model2'])
        })

        it('has the correct operation id', function () {
          expect(custompatch1).to.have.property('operationId', 'model2.custompatch1')
          expect(custompatch2).to.have.property('operationId', 'model2.custompatch2')
          expect(custompatch3).to.have.property('operationId', 'model2.custompatch3')
          expect(custompatch4).to.have.property('operationId', 'model2.custompatch4')
        })

        it('has the correct properties defined', function () {
          expect(custompatch1.parameters).to.have.length(3)
          expect(custompatch1.parameters[0]).to.deep.equal({
            name: 'number_property',
            in: 'path',
            description: 'model2 number_property',
            required: true,
            type: 'string'
          })
          expect(custompatch1.parameters[1]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })
          expect(custompatch1.parameters[2]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model2 q1',
            required: false,
            type: 'string'
          })

          expect(custompatch2.parameters).to.have.length(2)
          expect(custompatch2.parameters[0]).to.deep.equal({
            name: 'number_property',
            in: 'path',
            description: 'model2 number_property',
            required: true,
            type: 'string'
          })
          expect(custompatch2.parameters[1]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })

          expect(custompatch3.parameters).to.have.length(2)
          expect(custompatch3.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })
          expect(custompatch3.parameters[1]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model2 q1',
            required: false,
            type: 'string'
          })

          expect(custompatch4.parameters).to.have.length(1)
          expect(custompatch4.parameters[0]).to.deep.equal({
            name: 'data',
            in: 'body',
            description: 'model2 data',
            required: true,
            schema: {
              $ref: '#/definitions/model2'
            }
          })
        })

        it('has a 200 response containing the model', function () {
          expect(custompatch1.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
          expect(custompatch2.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
          expect(custompatch3.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
          expect(custompatch4.responses).to.deep.equal({
            200: {
              description: 'Request was successful',
              schema: {
                $ref: '#/definitions/model2'
              }
            }
          })
        })
      })

      context('Check head paths', function () {
        let customhead1
        let customhead2
        let customhead3
        let customhead4
        before(function () {
          customhead1 = swaggerJSON.paths['/model1/{string_property}/customhead1'].head
          customhead2 = swaggerJSON.paths['/model1/{string_property}/customhead2'].head
          customhead3 = swaggerJSON.paths['/model1/customhead3'].head
          customhead4 = swaggerJSON.paths['/model1/customhead4'].head
        })

        it('has the model name as a tag', function () {
          expect(customhead1.tags).to.deep.equal(['model1'])
          expect(customhead2.tags).to.deep.equal(['model1'])
          expect(customhead3.tags).to.deep.equal(['model1'])
          expect(customhead4.tags).to.deep.equal(['model1'])
        })

        it('has the correct operation id', function () {
          expect(customhead1).to.have.property('operationId', 'model1.customhead1')
          expect(customhead2).to.have.property('operationId', 'model1.customhead2')
          expect(customhead3).to.have.property('operationId', 'model1.customhead3')
          expect(customhead4).to.have.property('operationId', 'model1.customhead4')
        })

        it('has the correct properties defined', function () {
          expect(customhead1.parameters).to.have.length(2)
          expect(customhead1.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model1 string_property',
            required: true,
            type: 'string'
          })
          expect(customhead1.parameters[1]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model1 q1',
            required: false,
            type: 'string'
          })

          expect(customhead2.parameters).to.have.length(1)
          expect(customhead2.parameters[0]).to.deep.equal({
            name: 'string_property',
            in: 'path',
            description: 'model1 string_property',
            required: true,
            type: 'string'
          })

          expect(customhead3.parameters).to.have.length(1)
          expect(customhead3.parameters[0]).to.deep.equal({
            name: 'q1',
            in: 'query',
            description: 'model1 q1',
            required: false,
            type: 'string'
          })

          expect(customhead4.parameters).to.have.length(0)
        })

        it('has a 200 response containing the model', function () {
          expect(customhead1.responses).to.deep.equal({
            204: {
              description: 'Request was successful'
            }
          })
          expect(customhead2.responses).to.deep.equal({
            204: {
              description: 'Request was successful'
            }
          })
          expect(customhead3.responses).to.deep.equal({
            204: {
              description: 'Request was successful'
            }
          })
          expect(customhead4.responses).to.deep.equal({
            204: {
              description: 'Request was successful'
            }
          })
        })
      })
    })
  })
})
