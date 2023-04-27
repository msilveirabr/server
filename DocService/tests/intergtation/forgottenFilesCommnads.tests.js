const { describe, test, expect } = require('@jest/globals');
const http = require('http');
const storage = require('../../../Common/sources/storage-base');
const operationContext = require('../../../Common/sources/operationContext');
const config = require('../../../Common/config/default.json').services.CoAuthoring;

const cfgForgottenFiles = config.server.forgottenfiles;
const cfgForgottenFilesName = config.server.forgottenfilesname;
const ctx = new operationContext.Context();

function createRequest(requestBody, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject('Request timeout'), timeout);

    const options = {
      port: '8000',
      path: '/coauthoring/CommandService.ashx',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };
    const request = http.request(options, (response) => {
      response.setEncoding('utf8');

      let data = '';
      response.on('data', (chunk) => {
        data += chunk
      });
      response.on('end', () => {
        resolve(data);
        clearTimeout(timer);
      });
    });

    request.on('error', (error) => {
      reject(error);
      clearTimeout(timer);
    });

    request.write(requestBody);
    request.end();
  });
}

describe('Command service', function () {
  describe('Forgotten files commands verification', function () {
    // Assumed, that server is already up.
    test('getForgotten', async () => {
      const docId = 'DocService-DocsCoServer-forgottenFilesCommands-getForgotten-integration-test';
      const requestBody = JSON.stringify({
        c: 'getForgotten',
        key: docId
      });

      const buffer = Buffer.from('getForgotten test file');
      await storage.putObject(ctx, `${docId}/${cfgForgottenFilesName}.docx`, buffer, buffer.length, cfgForgottenFiles);

      const actualResponse = await createRequest(requestBody);

      const keys = await storage.listObjects(ctx, '', cfgForgottenFiles);
      const expected = {
        key: docId,
        error: 0,
        url: 'http://localhost:8000/cache/files/forgotten/DocService-DocsCoServer-forgottenFilesCommands-getForgotten-integration-test/output.docx/output.docx',
        keys: keys.map(value => value.split('/')[0])
      };
      const actual = JSON.parse(actualResponse);
      actual.url = actual.url.split('?')[0];

      expect(actual).toEqual(expected);

      await storage.deleteObject(ctx, `${docId}/${cfgForgottenFilesName}.docx`, cfgForgottenFiles);
    });

    test('deleteForgotten', async () => {
      const docId = 'DocService-DocsCoServer-forgottenFilesCommands-deleteForgotten-integration-test';
      const requestBody = JSON.stringify({
        c: 'deleteForgotten',
        key: docId
      });

      const buffer = Buffer.from('deleteForgotten test file');
      const keys = await storage.listObjects(ctx, '', cfgForgottenFiles);

      await storage.putObject(ctx, `${docId}/${cfgForgottenFilesName}.docx`, buffer, buffer.length, cfgForgottenFiles);
      const actualResponse = await createRequest(requestBody);

      const expected = {
        key: docId,
        error: 0,
        keys: keys.map(value => value.split('/')[0])
      };
      const actual = JSON.parse(actualResponse);

      expect(actual).toEqual(expected);
    });

    test('getForgottenList', async () => {
      const docId = 'DocService-DocsCoServer-forgottenFilesCommands-getForgottenList-integration-test';
      const requestBody = JSON.stringify({
        c: 'getForgottenList',
        key: docId
      });

      const keys = await storage.listObjects(ctx, '', cfgForgottenFiles);
      const actualResponse = await createRequest(requestBody);

      const expected = {
        key: docId,
        error: 0,
        keys: keys.map(value => value.split('/')[0])
      }
      const actual = JSON.parse(actualResponse);

      expect(expected).toEqual(actual);
    });
  });
});

