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

const fs = require('fs')
const path = require('path')
const handlebars = require('handlebars')
const archiver = require('archiver')
const yazl = require('yazl')
const Swagger = require('./swaggerGeneration')
const YAML = require('js-yaml')

// defaults for injected dependencies
const logger = {
  info: function (msg, logContext) {},
  error: function (msg, logContext, err) {}
}

const defaultMetricsReporter = {
  counter: function (metricName) {}
}

let metrics = defaultMetricsReporter

function setMetricsReporter (metricsReporter) {
  if (metricsReporter) {
    metrics = metricsReporter
  } else {
    // reset to default
    metrics = defaultMetricsReporter
  }
}

let unsupportedActionList = {}
function setUnsupportedActionList (newUnsupportedActionList) {
  unsupportedActionList = newUnsupportedActionList
}

const jsonata = require('jsonata')

// TODO: Add unit test which replicates the test server

/**
 * Builds the BAR file and sends it back via the writable stream.
 * If the writable stream is an express response object then we will
 * set the stream as an attachment name if successful or send an error
 * status if unsuccessful.
 *
 * @param {Object} res - Writeable stream
 * @param {Array}  integrationDocs - YAML representation of the integration doc
 * @param {String} csInstanceId - The connector service instance ID, to set in the BAR
 * @param {String} csUrl - The URL for connector service, to set in the BAR
 * @param {String} csApiKeyName - The mqsisetdbparms resource name holding the connector service API key, to set in the BAR
 * @param {Object} logContext
 * @return {Promise<barName>} - The name of the bar file
 */
function buildBar (res, integrationDocs, csInstanceId, csUrl, csApiKeyName, logContext) {
  logger.info(`Generating bar file for instance '${csInstanceId}'`, logContext)

  const bar = module.exports.internal.createBar(res, logContext)

  // Handle a single doc being passed in
  if (!Array.isArray(integrationDocs)) {
    integrationDocs = [integrationDocs]
  }

  const promiseArray = []
  integrationDocs.forEach(integrationDoc => {
    promiseArray.push(module.exports.internal.processIntegrationDoc(bar, integrationDoc, csInstanceId, csUrl, csApiKeyName, logContext))
  })

  return Promise.all(promiseArray)
    .then(response => {
      // Name the bar
      let barName = 'App-Connect-REST-API'
      if (integrationDocs.length === 1) {
        barName = response[0]
      }

      // Set attachment if we have been passed an express response stream
      if (typeof res.attachment === 'function') {
        res.attachment(`${barName}.bar`)
      }

      // This causes res.end() to be called
      bar.finalize()
      logger.info(`Successfully created BAR file ${barName}`, logContext)
      metrics.counter('bargen.success')
      return barName
    })
    .catch(err => {
      err.statusCode = err.statusCode || 500
      logger.error('Failed to build BAR. Error: ' + err.message, logContext, err)
      metrics.counter('bargen.failed.' + err.statusCode)
      // Send the error if we have been passed an express response stream
      // else set the error as a property of the stream
      // Note that in both cases, the promise is resolved
      if (typeof res.attachment === 'function') {
        res.status(err.statusCode).send(err)
      } else {
        res.error = err
        res.end()
      }
    })
}

/**
 * Creates a BAR in the output folder
 *
 * @param {Object} res - Writeable stream
 * @param {Object} logContext
 */
function createBar (res, logContext) {
  logger.info('Entering createBar', logContext)

  const bar = archiver('zip', {
    zlib: { level: 9 }
  })

  bar.pipe(res)

  // Create the META-INF folder
  bar.file(path.join(__dirname, '/../boilerplateBarFiles/META-INF/manifest.mf'), { name: 'META-INF/manifest.mf' })

  return bar
}

/**
 *
 * @param bar {Object} - Zip where the integration will be added
 * @param integrationDoc {String} - YAML representation of the integration document
 * @param {String} csInstanceId - The connector service instance ID, to set in the BAR
 * @param {String} csUrl - The URL for connector service, to set in the BAR
 * @param {String} csApiKeyName - The mqsisetdbparms resource name holding the connector service API key, to set in the BAR
 * @param logContext
 * @returns {Promise<any>}
 */
function processIntegrationDoc (bar, integrationDoc, csInstanceId, csUrl, csApiKeyName, logContext) {
  // Handle YAML as a string or object
  let integrationDocJson
  if (typeof integrationDoc === 'string') {
    integrationDocJson = YAML.safeLoad(integrationDoc)
  } else {
    integrationDocJson = integrationDoc
  }

  return module.exports.internal.checkFlowForUnsupportedActions(integrationDocJson, logContext)
    .then(() => {
      const swagger = new Swagger(integrationDocJson)
      const parsedApiDefinition = module.exports.internal.parseApiDefinition(swagger, logContext)
      parsedApiDefinition.csInstanceId = csInstanceId
      parsedApiDefinition.csUrl = csUrl
      parsedApiDefinition.csApiKeyName = csApiKeyName || parsedApiDefinition.mainFlowName
      module.exports.internal.addIntegrationToBar(bar, parsedApiDefinition, swagger, logContext)
      return Promise.resolve(parsedApiDefinition.mainFlowName)
    })
    .catch(err => {
      if (err.messageCode) {
        logger.error(err.message, logContext, err)
        return Promise.reject(err)
      } else {
        logger.error('Unable to create a bar file from the integration doc provided', logContext, err)
        const errorMessage = {
          catalog: 'designer-flows-software',
          messageCode: 'dfs0003',
          message: 'Unable to create bar from integration doc.',
          statusCode: 400
        }
        return Promise.reject(errorMessage)
      }
    })
}

/**
 * Check the integration doc for unsupported actions
 *
 * @param {String} integrationDoc - YAML representation of the integration doc
 * @param logContext
 * @returns {Promise}
 */
const checkFlowForUnsupportedActions = function (integrationDoc, logContext) {
  return new Promise(function (resolve, reject) {
    // Get list of toolbox style nodes
    const executeExpression = jsonata('$keys(**.execute)')
    const executeActions = executeExpression.evaluate(integrationDoc)

    // Get list of connectors used
    const executeConnectorsExpression = jsonata('**.`connector-type`')
    const executeConnectors = executeConnectorsExpression.evaluate(integrationDoc)

    // Check both lists against known unsupported list
    const flowContainsActions = []
    Object.keys(unsupportedActionList).forEach(unsupportedAction => {
      if (executeActions && executeActions.includes(unsupportedAction)) {
        flowContainsActions.push(unsupportedActionList[unsupportedAction])
      }
      if (executeConnectors && executeConnectors.includes(unsupportedAction)) {
        flowContainsActions.push(unsupportedActionList[unsupportedAction])
      }
    })

    if (flowContainsActions.length === 0) {
      logger.info('No unsupported actions found in flow', logContext)
      resolve()
    } else {
      logger.info('Flow contains the following unsupported actions:' + flowContainsActions, logContext)
      const errorMessage = {
        catalog: 'designer-flows-software',
        messageCode: 'dfs0002',
        positionalInserts: [flowContainsActions],
        message: 'Flow contains unsupported actions.',
        statusCode: 400
      }
      reject(errorMessage)
    }
  })
}

/**
 * Pulls out the parts we need from the Open API document
 *
 * @param {Object} swagger - The full API definition
 * @param {Object} logContext
 * @returns {{mainFlowName: (XString|string|*), basePath: *, operations: Array}}
 */
function parseApiDefinition (swagger, logContext) {
  logger.info('Entering parseApiDefinition', logContext)
  const fullApiDefinition = swagger.json()

  const parameters = {
    mainFlowName: fullApiDefinition.info.title,
    basePath: fullApiDefinition.basePath,
    operations: []
  }

  Object.keys(fullApiDefinition.paths).forEach(path => {
    Object.keys(fullApiDefinition.paths[path]).forEach(method => {
      const name = fullApiDefinition.paths[path][method].operationId
      const subflowName = name.replace('.', '_')
      const operationCount = parameters.operations.length
      parameters.operations.push({
        name,
        subflowName,
        mainFlowName: parameters.mainFlowName,
        method,
        labelNodeId: 'FCMComposite_1_' + (2 * (operationCount + 3)),
        subflowNodeId: 'FCMComposite_1_' + (2 * (operationCount + 3) + 1),
        connection1Id: `FCMConnection_${3 + (2 * operationCount)}`,
        connection2Id: `FCMConnection_${4 + (2 * operationCount)}`,
        branchYPos: 225 + (75 * operationCount)
      })
    })
  })

  return parameters
}

/**
 * Adds an API appzip and policy to the bar file
 *
 * @param bar {Object} - Zip where the integration will be added
 * @param parsedApiDefinition {Object} - The parsed API properties
 * @param swagger {Object} - The full API definition
 * @param logContext
 */
function addIntegrationToBar (bar, parsedApiDefinition, swagger, logContext) {
  // Add the policy
  bar.append(processTemplate('policy', parsedApiDefinition), { name: `${parsedApiDefinition.mainFlowName}PolicyProject/${parsedApiDefinition.mainFlowName}.policyxml` })

  // Add the policy descriptor
  bar.file(path.join(__dirname, '/../boilerplateBarFiles/PolicyProject/policy.descriptor'), { name: `${parsedApiDefinition.mainFlowName}PolicyProject/policy.descriptor` })

  // Add the appzip
  const appzip = module.exports.internal.createAppzip(parsedApiDefinition, swagger, logContext)
  bar.append(appzip.outputStream, { name: `${parsedApiDefinition.mainFlowName}.appzip` })
}

/**
 * Applies values from the API definition to the template
 *
 * @param {String} templateName - Name of the template file
 * @param {Object} parsedApiDefinition - Values pulled from the Open API document
 *
 */
function processTemplate (templateName, parsedApiDefinition) {
  const source = fs.readFileSync(path.join(__dirname, `/../templates/${templateName}.template`), { encoding: 'utf8' })
  const template = handlebars.compile(source)
  return template(parsedApiDefinition)
}

/**
 * Creates an appzip in the output folder
 *
 * @param {Object} parsedApiDefinition - Values pulled from the Open API document
 * @param {Object} swagger - The full API definition
 * @param {Object} logContext
 */
function createAppzip (parsedApiDefinition, swagger, logContext) {
  logger.info('Entering createAppzip', logContext)

  const appzip = new yazl.ZipFile()

  appzip.addBuffer(Buffer.from(processTemplate('descriptor', parsedApiDefinition).toString()), 'restapi.descriptor')
  appzip.addBuffer(Buffer.from(processTemplate('esql', parsedApiDefinition).toString()), `${parsedApiDefinition.mainFlowName}_Compute.esql`)
  appzip.addBuffer(Buffer.from(processTemplate('esql_FailureHandler', parsedApiDefinition).toString()), `${parsedApiDefinition.mainFlowName}_FailureHandler.esql`)
  appzip.addBuffer(Buffer.from(processTemplate('mainflow', parsedApiDefinition).toString()), `gen/${parsedApiDefinition.mainFlowName}.msgflow`)

  // Add subflows to the appzip
  parsedApiDefinition.operations.forEach(operation => {
    const templateInput = {
      mainFlowName: parsedApiDefinition.mainFlowName,
      subflowName: operation.subflowName
    }

    if (operation.method === 'post' || operation.method === 'put' || operation.method === 'patch') {
      appzip.addBuffer(Buffer.from(processTemplate('subflow_with_body', templateInput).toString()), `${operation.subflowName}.subflow`)
    } else {
      appzip.addBuffer(Buffer.from(processTemplate('subflow_no_body', templateInput).toString()), `${operation.subflowName}.subflow`)
    }
  })

  // Add API definition to the appzip
  appzip.addBuffer(Buffer.from(JSON.stringify(swagger.json(), null, 2)), `${parsedApiDefinition.mainFlowName}.json`)
  appzip.addBuffer(Buffer.from(swagger.flowDoc()), `${parsedApiDefinition.mainFlowName}.yaml`)

  // Create the META-INF folder
  appzip.addFile(path.join(__dirname, '/../boilerplateBarFiles/META-INF/manifest.mf'), 'META-INF/manifest.mf')
  appzip.addBuffer(Buffer.from(processTemplate('brokerxml', parsedApiDefinition).toString()), 'META-INF/broker.xml')

  appzip.end()
  logger.info('Successfully built appzip', logContext)
  return appzip
}

module.exports = {
  buildBar,
  setMetricsReporter,
  setUnsupportedActionList,
  internal: {
    parseApiDefinition,
    processTemplate,
    createAppzip,
    createBar,
    checkFlowForUnsupportedActions,
    processIntegrationDoc,
    addIntegrationToBar
  }
}
