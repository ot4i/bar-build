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

const chai = require('chai')
const expect = chai.expect
const chaiAsPromised = require('chai-as-promised')
const fs = require('fs')
chai.use(chaiAsPromised)
const yauzl = require('yauzl')
const BufferList = require('bl')
const path = require('path')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const httpMocks = require('node-mocks-http')
const events = require('events')
chai.use(sinonChai)

const barGeneration = require('../../lib/barGeneration.js')

const Swagger = require('../../lib/swaggerGeneration')

const YAML = require('js-yaml')
const MemoryStream = require('memorystream')

const salesforceIntegrationDocYaml = fs.readFileSync(path.join(__dirname, './test_files/salesforce.yaml'), 'utf-8')
const salesforceIntegrationDoc = YAML.safeLoad(salesforceIntegrationDocYaml)
const anotherSalesforceIntegrationDoc = YAML.safeLoad(fs.readFileSync(path.join(__dirname, './test_files/anotherSalesforce.yaml')))
const salesforceoLd2DjIntegrationDoc = YAML.safeLoad(fs.readFileSync(path.join(__dirname, './test_files/salesforce-oLd2Dj.yaml')))
const salesforceParsedApiDefinition = require('./test_files/salesforceParsedApiDefinition')
const salesforceParsedApiDefinition2 = require('./test_files/salesforceParsedApiDefinition2')
const salesforceoLd2DjParsedApiDefinition = require('./test_files/salesforceoLd2DjParsedApiDefinition')

/* injected dependencies */
const metrics = {
  counter: function (metricName) {}
}
const logContext = {}

describe('Bar generation', () => {
  describe('buildBar', () => {
    const csInstanceId = 'fakeCSInstanceId'

    describe('when the BAR is built successfully', () => {
      beforeEach(function () {
        sinon.spy(barGeneration.internal, 'processIntegrationDoc')
        sinon.spy(metrics, 'counter')
        barGeneration.setMetricsReporter(metrics)
      })

      afterEach(function () {
        barGeneration.internal.processIntegrationDoc.restore()
        barGeneration.setMetricsReporter(null)
        metrics.counter.restore()
      })

      it('contains all the correct files', function (done) {
        const expectedFileNames = [
          'salesforcePolicyProject/policy.descriptor',
          'META-INF/manifest.mf',
          'salesforcePolicyProject/salesforce.policyxml',
          'salesforce.appzip'
        ]

        const res = validateZip(expectedFileNames, function (err) {
          if (err) {
            done(err)
          } else {
            expect(metrics.counter).to.have.been.calledWith('bargen.success')
            expect(res.attachment.callCount).to.equal(1)
            expect(res.attachment).to.have.been.calledWithExactly('salesforce.bar')
            done()
          }
        })
        res.attachment = sinon.stub()

        expect(barGeneration.buildBar(res, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)).to.be.fulfilled
          .then(response => {
            expect(response).to.equal('salesforce')
          })
      })

      it('works when res is not an express response', function (done) {
        const res = new MemoryStream()

        res.on('finish', function () {
          expect(res.error).to.equal(undefined)
          expect(barGeneration.internal.processIntegrationDoc).to.have.been.calledWith(sinon.match.any, sinon.match.any, csInstanceId)
          done()
        })

        expect(barGeneration.buildBar(res, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)).to.be.fulfilled
          .then(response => {
            expect(response).to.equal('salesforce')
          })
      })
    })

    describe('when there are multiple integration docs provided and the BAR is built successfully', () => {
      it('contains all the correct files', function (done) {
        const expectedFileNames = [
          'salesforcePolicyProject/policy.descriptor',
          'anotherSalesforcePolicyProject/policy.descriptor',
          'META-INF/manifest.mf',
          'salesforcePolicyProject/salesforce.policyxml',
          'salesforce.appzip',
          'anotherSalesforcePolicyProject/anotherSalesforce.policyxml',
          'anotherSalesforce.appzip'
        ]

        const res = validateZip(expectedFileNames, function (err) {
          if (err) {
            done(err)
          } else {
            expect(res.attachment.callCount).to.equal(1)
            expect(res.attachment).to.have.been.calledWithExactly('App-Connect-REST-API.bar')
            done()
          }
        })
        res.attachment = sinon.stub()

        expect(barGeneration.buildBar(res, [salesforceIntegrationDoc, anotherSalesforceIntegrationDoc], csInstanceId, undefined, undefined, logContext)).to.be.fulfilled
          .then(response => {
            expect(response).to.equal('App-Connect-REST-API')
          })
      })

      it('works when res is not an express response', function (done) {
        const res = new MemoryStream()

        res.on('finish', function () {
          expect(res.error).to.equal(undefined)
          done()
        })

        expect(barGeneration.buildBar(res, [salesforceIntegrationDoc, anotherSalesforceIntegrationDoc], csInstanceId, undefined, undefined, logContext)).to.be.fulfilled
          .then(response => {
            expect(response).to.equal('App-Connect-REST-API')
          })
      })
    })

    describe('when there is an error while building the BAR', () => {
      beforeEach(() => {
        sinon.stub(barGeneration.internal, 'processIntegrationDoc').rejects(new Error('Test error'))
        sinon.spy(metrics, 'counter')
        barGeneration.setMetricsReporter(metrics)
      })

      afterEach(() => {
        barGeneration.internal.processIntegrationDoc.restore()
        metrics.counter.restore()
        barGeneration.setMetricsReporter(null)
      })

      it('sends an error', function (done) {
        const res = httpMocks.createResponse({
          eventEmitter: events.EventEmitter
        })

        res.on('end', function () {
          try {
            const data = res._getData()
            expect(res.statusCode).to.equal(500)
            expect(data.message).to.equal('Test error')
            expect(metrics.counter).to.have.been.calledWith('bargen.failed.500')
            done()
          } catch (e) {
            done(e)
          }
        })

        res.attachment = sinon.stub()

        barGeneration.buildBar(res, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)
      })

      it('returns an error when res is not an express response', function (done) {
        const res = new MemoryStream()

        res.on('finish', function () {
          expect(res.error).to.not.equal(undefined)
          expect(res.error.statusCode).to.equal(500)
          expect(res.error.message).to.equal('Test error')
          done()
        })

        barGeneration.buildBar(res, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)
      })
    })

    describe('when there is an error while building the BAR from unsupported flow', () => {
      let unsupportedIntegrationDoc
      let incompleteIntegrationDocYaml
      let unsupportedActionList

      beforeEach(() => {
        sinon.spy(metrics, 'counter')

        const unsupportedIntegrationDocYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'apiUnsupported1.yaml'), 'utf8')
        unsupportedIntegrationDoc = YAML.safeLoad(unsupportedIntegrationDocYaml)

        incompleteIntegrationDocYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'Untitled API 1.yaml'), 'utf8')
        unsupportedActionList = {
          'batch-retrieve-action': 'Batch process',
          notification: 'Notification',
          'emit-event': 'Situation detector',
          'bulk-upsert-action': 'Bulk process',
          box: 'Box',
          amazons3: 'Amazon S3',
          ibmcoss3: 'IBM Cloud Object Storage S3'
        }
        barGeneration.setUnsupportedActionList(unsupportedActionList)
        barGeneration.setMetricsReporter(metrics)
      })

      afterEach(() => {
        metrics.counter.restore()
        barGeneration.setUnsupportedActionList({})
        barGeneration.setMetricsReporter(null)
      })

      it('sends an error', function (done) {
        const res = httpMocks.createResponse({
          eventEmitter: events.EventEmitter
        })

        res.on('end', function () {
          try {
            const data = res._getData()
            expect(res.statusCode).to.equal(400)
            expect(data.messageCode).to.equal('dfs0002')
            expect(data.message).to.equal('Flow contains unsupported actions.')
            expect(metrics.counter).to.have.been.calledWith('bargen.failed.400')
            done()
          } catch (e) {
            done(e)
          }
        })

        res.attachment = sinon.stub()

        barGeneration.buildBar(res, unsupportedIntegrationDoc, csInstanceId, undefined, undefined, logContext)
      })

      it('sends an error when the flow is incomplete', function (done) {
        const res = httpMocks.createResponse({
          eventEmitter: events.EventEmitter
        })

        res.on('end', function () {
          try {
            const data = res._getData()
            expect(res.statusCode).to.equal(400)
            expect(data.messageCode).to.equal('dfs0003')
            expect(data.message).to.equal('Unable to create bar from integration doc.')
            expect(metrics.counter).to.have.been.calledWith('bargen.failed.400')
            done()
          } catch (e) {
            done(e)
          }
        })

        res.attachment = sinon.stub()

        barGeneration.buildBar(res, incompleteIntegrationDocYaml, csInstanceId, undefined, undefined, logContext)
      })

      it('returns an error when res is not an express response', function (done) {
        const res = new MemoryStream()

        res.on('finish', function () {
          expect(res.error).to.not.equal(undefined)
          expect(res.error.statusCode).to.equal(400)
          expect(res.error.message).to.equal('Flow contains unsupported actions.')
          expect(metrics.counter).to.have.been.calledWith('bargen.failed.400')
          done()
        })

        barGeneration.buildBar(res, unsupportedIntegrationDoc, csInstanceId, undefined, undefined, logContext)
      })
    })
  })

  describe('createBar', () => {
    it('creates a zip file with the correct contents', (done) => {
      const expectedFileNames = [
        'META-INF/manifest.mf'
      ]
      const res = validateZip(expectedFileNames, done)
      const bar = barGeneration.internal.createBar(res, logContext)
      bar.finalize()
    })

    it('works when res is not an express response', (done) => {
      const expectedFileNames = [
        'META-INF/manifest.mf'
      ]
      const res = validateZip(expectedFileNames, done)
      const bar = barGeneration.internal.createBar(res, logContext)
      bar.finalize()
    })
  })

  describe('processIntegrationDoc', () => {
    const bar = {}
    const csInstanceId = 'fakeCSInstanceId'
    const csUrl = 'https://fakeCS.ibm.com'
    const csApiKeyName = 'defaultCSApiKeyName'

    describe('when the integration document contains unsupported actions', () => {
      beforeEach(() => {
        const stubError = new Error('Found an unsupported action')
        stubError.messageCode = 'dfs000x'
        sinon.stub(barGeneration.internal, 'checkFlowForUnsupportedActions').rejects(stubError)
      })

      afterEach(() => {
        barGeneration.internal.checkFlowForUnsupportedActions.restore()
      })

      it('rejects a promise', () => {
        return expect(barGeneration.internal.processIntegrationDoc(bar, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)).to.be.rejectedWith('Found an unsupported action')
      })
    })

    describe('when parsing the API fails', () => {
      beforeEach(() => {
        const stubError = new Error('Failed to parse API')
        stubError.messageCode = 'dfs000x'
        sinon.stub(barGeneration.internal, 'parseApiDefinition').throws(stubError)
        sinon.stub(barGeneration.internal, 'checkFlowForUnsupportedActions').resolves()
      })

      afterEach(() => {
        barGeneration.internal.checkFlowForUnsupportedActions.restore()
        barGeneration.internal.parseApiDefinition.restore()
      })

      it('rejects a promise', () => {
        return expect(barGeneration.internal.processIntegrationDoc(bar, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)).to.be.rejectedWith('Failed to parse API')
      })
    })

    describe('when adding the integration to the BAR fails', () => {
      beforeEach(() => {
        sinon.stub(barGeneration.internal, 'checkFlowForUnsupportedActions').resolves()
        sinon.stub(barGeneration.internal, 'parseApiDefinition').returns({})
        const stubError = new Error('Failed to add integration to BAR')
        stubError.messageCode = 'dfs000x'
        sinon.stub(barGeneration.internal, 'addIntegrationToBar').throws(stubError)
      })

      afterEach(() => {
        barGeneration.internal.checkFlowForUnsupportedActions.restore()
        barGeneration.internal.parseApiDefinition.restore()
        barGeneration.internal.addIntegrationToBar.restore()
      })

      it('rejects a promise', () => {
        return expect(barGeneration.internal.processIntegrationDoc(bar, salesforceIntegrationDoc, csInstanceId, undefined, undefined, logContext)).to.be.rejectedWith('Failed to add integration to BAR')
      })
    })

    describe('when processing the integration succeeds', () => {
      beforeEach(() => {
        sinon.stub(barGeneration.internal, 'checkFlowForUnsupportedActions').resolves()
        sinon.stub(barGeneration.internal, 'addIntegrationToBar').returns()
        sinon.spy(barGeneration.internal, 'parseApiDefinition')
      })

      afterEach(() => {
        barGeneration.internal.checkFlowForUnsupportedActions.restore()
        barGeneration.internal.addIntegrationToBar.restore()
        barGeneration.internal.parseApiDefinition.restore()
      })

      it('resolves a promise when passing in json', () => {
        return expect(barGeneration.internal.processIntegrationDoc(bar, salesforceIntegrationDoc, csInstanceId, csUrl, undefined, logContext)).to.be.fulfilled
          .then(response => {
            expect(barGeneration.internal.checkFlowForUnsupportedActions.callCount).to.equal(1)
            expect(barGeneration.internal.addIntegrationToBar.callCount).to.equal(1)
            expect(barGeneration.internal.addIntegrationToBar).to.have.been.calledWith(sinon.match.any, salesforceParsedApiDefinition, sinon.match.any, logContext)
            expect(response).to.equal('salesforce')
          })
      })

      it('resolves a promise when passing in yaml', () => {
        return expect(barGeneration.internal.processIntegrationDoc(bar, salesforceIntegrationDocYaml, csInstanceId, csUrl, undefined, logContext)).to.be.fulfilled
          .then(response => {
            expect(barGeneration.internal.checkFlowForUnsupportedActions.callCount).to.equal(1)
            expect(barGeneration.internal.addIntegrationToBar.callCount).to.equal(1)
            expect(barGeneration.internal.addIntegrationToBar).to.have.been.calledWith(sinon.match.any, salesforceParsedApiDefinition, sinon.match.any, logContext)
            expect(response).to.equal('salesforce')
          })
      })

      it('resolves a promise when passing in yaml with overrides for CS URL and API Key Name', () => {
        return expect(barGeneration.internal.processIntegrationDoc(bar, salesforceIntegrationDocYaml, csInstanceId, csUrl, csApiKeyName, logContext)).to.be.fulfilled
          .then(response => {
            expect(barGeneration.internal.checkFlowForUnsupportedActions.callCount).to.equal(1)
            expect(barGeneration.internal.addIntegrationToBar.callCount).to.equal(1)
            expect(barGeneration.internal.addIntegrationToBar).to.have.been.calledWith(sinon.match.any, salesforceParsedApiDefinition2, sinon.match.any, logContext)
            expect(response).to.equal('salesforce')
          })
      })
    })
  })

  describe('checkFlowForUnsupportedActions', () => {
    let unsupportedActionList
    beforeEach(() => {
      unsupportedActionList = {
        'batch-retrieve-action': 'Batch process',
        notification: 'Notification',
        'emit-event': 'Situation detector',
        'bulk-upsert-action': 'Bulk process',
        box: 'Box',
        amazons3: 'Amazon S3',
        ibmcoss3: 'IBM Cloud Object Storage S3'
      }
      barGeneration.setUnsupportedActionList(unsupportedActionList)
    })

    afterEach(() => {
      barGeneration.setUnsupportedActionList({})
    })

    it('Detects flow contains unsupported nodes', () => {
      const unsupportedIntegrationDocYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'apiUnsupported1.yaml'), 'utf8')
      const unsupportedIntegrationDoc = YAML.safeLoad(unsupportedIntegrationDocYaml)

      const expectedUnsupportedList = ['Batch process', 'Notification', 'Situation detector']
      return expect(barGeneration.internal.checkFlowForUnsupportedActions(unsupportedIntegrationDoc, logContext))
        .to.eventually.be.rejected
        .then(err => {
          expect(err.messageCode).to.deep.equal('dfs0002')
          expect(err.positionalInserts).to.not.deep.equal(undefined)
          expect(err.positionalInserts[0]).to.deep.equal(expectedUnsupportedList)
          expect(err.statusCode).to.deep.equal(400)
        })
    })

    it('Detects flow contains callable flow', () => {
      const unsupportedIntegrationDocYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'apiUsingCallableFlow.yaml'), 'utf8')
      const unsupportedIntegrationDoc = YAML.safeLoad(unsupportedIntegrationDocYaml)

      unsupportedActionList.iiboc = 'Callable flows'
      barGeneration.setUnsupportedActionList(unsupportedActionList)

      const expectedUnsupportedList = ['Callable flows']
      return expect(barGeneration.internal.checkFlowForUnsupportedActions(unsupportedIntegrationDoc, unsupportedActionList, logContext))
        .to.eventually.be.rejected
        .then(err => {
          expect(err.messageCode).to.deep.equal('dfs0002')
          expect(err.positionalInserts).to.not.deep.equal(undefined)
          expect(err.positionalInserts[0]).to.deep.equal(expectedUnsupportedList)
          expect(err.statusCode).to.deep.equal(400)
        })
    })

    it('should consider callable flows as supported actions', () => {
      const unsupportedIntegrationDocYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'apiUsingCallableFlow.yaml'), 'utf8')
      const unsupportedIntegrationDoc = YAML.safeLoad(unsupportedIntegrationDocYaml)

      return expect(barGeneration.internal.checkFlowForUnsupportedActions(unsupportedIntegrationDoc, logContext))
        .to.eventually.be.fulfilled
        .then(resp => {
          expect(resp).to.equal(undefined)
        })
    })

    it('Flow containing only supported nodes successfully passes', () => {
      const supportedIntegrationDocYaml = fs.readFileSync(path.join(__dirname, 'test_files', 'sunflower api.yaml'), 'utf8')
      const supportedIntegrationDoc = YAML.safeLoad(supportedIntegrationDocYaml)

      return expect(barGeneration.internal.checkFlowForUnsupportedActions(supportedIntegrationDoc, unsupportedActionList, logContext))
        .to.eventually.be.fulfilled
    })

    it('Flow used in IT successfully passes', () => {
      const supportedIntegrationDoc = fs.readFileSync(path.join(__dirname, 'test_files', 'flow_document_no_account_api.json'), 'utf8')

      return expect(barGeneration.internal.checkFlowForUnsupportedActions(supportedIntegrationDoc, unsupportedActionList, logContext))
        .to.eventually.be.fulfilled
    })
  })

  describe('parseApiDefinition', () => {
    it('pulls all the properties needed out of the swagger', () => {
      const swagger = new Swagger(salesforceoLd2DjIntegrationDoc)
      const parsedApiParameters = barGeneration.internal.parseApiDefinition(swagger, logContext)
      expect(parsedApiParameters).to.deep.equal(salesforceoLd2DjParsedApiDefinition)
    })
  })

  describe('addIntegrationToBar', () => {
    beforeEach(() => {
      sinon.stub(barGeneration.internal, 'createAppzip').returns({})
    })

    afterEach(() => {
      barGeneration.internal.createAppzip.restore()
    })

    it('adds the expected files to the BAR', () => {
      const appendStub = sinon.stub()
      const fileStub = sinon.stub()
      const bar = {
        append: appendStub,
        file: fileStub
      }
      barGeneration.internal.addIntegrationToBar(bar, salesforceParsedApiDefinition, {}, logContext)
      expect(appendStub.callCount).to.equal(2)
      expect(fileStub.callCount).to.equal(1)
      expect(fileStub).to.have.been.calledWith(sinon.match.any, { name: 'salesforcePolicyProject/policy.descriptor' })
      expect(appendStub).to.have.been.calledWith(sinon.match.any, { name: 'salesforcePolicyProject/salesforce.policyxml' })
      expect(appendStub).to.have.been.calledWith(sinon.match.any, { name: 'salesforce.appzip' })
      expect(barGeneration.internal.createAppzip.callCount).to.equal(1)
    })
  })

  describe('processTemplate', () => {
    it('applies the variables from the API definition into the handlebars template', () => {
      const templateName = 'mainflow'
      const completedTemplate = barGeneration.internal.processTemplate(templateName, salesforceParsedApiDefinition)
      const expectedResponse = fs.readFileSync(path.join(__dirname, './test_files/processedMainFlow.msgflow'), 'utf-8')
      expect(completedTemplate).to.equal(expectedResponse)
    })
  })

  describe('createAppzip', () => {
    it('creates a zip file with the correct contents', (done) => {
      const swagger = new Swagger(salesforceIntegrationDoc)
      const appzip = barGeneration.internal.createAppzip(salesforceParsedApiDefinition, swagger, logContext)
      expect(appzip).to.have.property('outputStream')

      const expectedFileNames = [
        'restapi.descriptor',
        'salesforce_Compute.esql',
        'gen/salesforce.msgflow',
        'account_upsertWithWhere.subflow',
        'account_patchAttributes.subflow',
        'account_findById.subflow',
        'account_find.subflow',
        'account_create.subflow',
        'account_del.subflow',
        'lead_create.subflow',
        'lead_findById.subflow',
        'salesforce.json',
        'META-INF/manifest.mf',
        'META-INF/broker.xml',
        'salesforce_FailureHandler.esql',
        'salesforce.yaml'
      ]
      inspectArchiveContents(appzip.outputStream, expectedFileNames, done)
    })
  })

  function validateZip (expectedFileNames, callback) {
    const res = new BufferList(function (err, data) {
      if (err) {
        throw err
      }
      yauzl.fromBuffer(data, { lazyEntries: true }, (err, zipfile) => {
        const filesInZip = []

        if (err) {
          this.callback(err)
        }

        zipfile.readEntry()

        zipfile.on('end', () => {
          if (filesInZip.length !== expectedFileNames.length) {
            callback(new Error(`There should be ${expectedFileNames.length} files in the zip but it actually contains ${filesInZip.length}. The files in the zip are ${filesInZip}`))
          } else {
            callback()
          }
        })

        zipfile.on('entry', entry => {
          try {
            filesInZip.push(entry.fileName)
            expect(expectedFileNames).to.include(entry.fileName, `Expected files in the BAR: ${expectedFileNames}`)
            expect(entry.uncompressedSize).to.not.equal(0)

            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err
              const chunks = []

              readStream.on('end', () => {
                const fileContent = Buffer.concat(chunks).toString()
                if (!entry.fileName.endsWith('.appzip')) {
                  const expectedContent = fs.readFileSync(path.join(__dirname, './test_files', entry.fileName), 'utf-8')
                  expect(fileContent).to.equal(expectedContent, `File: ${entry.fileName} did not match expected file`)
                }
                zipfile.readEntry()
              })

              readStream.on('data', (chunk) => {
                chunks.push(chunk)
              })
            })
          } catch (err) {
            callback(err)
          }
        })
      })
    })

    res.attachment = (fileName) => {
      res.fileName = fileName
    }

    res.send = (err) => {
      callback(err)
    }

    return res
  }

  function inspectArchiveContents (archiveFile, expectedFileNames, callback) {
    archiveFile.pipe(validateZip(expectedFileNames, callback))
  }
})
