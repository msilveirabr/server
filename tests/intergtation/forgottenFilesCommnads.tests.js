const { describe, test, expect, afterAll, beforeAll } = require('@jest/globals');
const http = require('http');
const storage = require('../../Common/sources/storage-base');
const operationContext = require('../../Common/sources/operationContext');
const config = require('../../Common/config/default.json').services.CoAuthoring;

const cfgForgottenFiles = config.server.forgottenfiles;
const cfgForgottenFilesName = config.server.forgottenfilesname;
const ctx = new operationContext.Context();
const testFilesNames = {
  get: 'DocService-DocsCoServer-forgottenFilesCommands-getForgotten-integration-test',
  delete1: 'DocService-DocsCoServer-forgottenFilesCommands-deleteForgotten-integration-test',
  delete2: 'DocService-DocsCoServer-forgottenFilesCommands-deleteForgotten-2-integration-test',
  delete3: 'DocService-DocsCoServer-forgottenFilesCommands-deleteForgotten-3-integration-test',
  getList: 'DocService-DocsCoServer-forgottenFilesCommands-getForgottenList-integration-test'
};

function makeRequest(requestBody, timeout = 5000) {
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

function getKeysDirectories(keys) {
  return keys.map(value => value.split('/')[0]);
}

beforeAll(async function () {
  const buffer = Buffer.from('Forgotten commands test file');
  for (const index in testFilesNames) {
    await storage.putObject(ctx, `${testFilesNames[index]}/${cfgForgottenFilesName}.docx`, buffer, buffer.length, cfgForgottenFiles);
  }
});

afterAll(async function () {
  const keys = await storage.listObjects(ctx, '', cfgForgottenFiles);
  const deletePromises = keys.filter(key => key.includes('DocService-DocsCoServer-forgottenFilesCommands'))
    .map(filteredKey => storage.deleteObject(ctx, filteredKey, cfgForgottenFiles));

  return Promise.allSettled(deletePromises);
});

// Assumed, that server is already up.
describe('Command service', function () {
  describe('Forgotten files commands parameters validation', function () {
    describe('Invalid key format', function () {
      const tests = ['getForgotten', 'deleteForgotten', 'getForgottenList'];
      const addSpecialCases = (invalidRequests, expected, testSubject) => {
        if (testSubject === 'getForgottenList') {
          return;
        }

        invalidRequests.push(JSON.stringify({
          c: testSubject
        }));
        expected.push({ error: 1});

        invalidRequests.push(JSON.stringify({
          c: testSubject,
          key: null
        }));
        expected.push({
          key: null,
          error: 1
        });
      };

      for (const testSubject of tests) {
        test(testSubject, async function () {
          const invalidKeys = [true, "someKey", [], {}, 1, 1.1];
          const invalidRequests = invalidKeys.map(key => JSON.stringify({
            c: testSubject,
            key
          }));

          const expected = invalidKeys.map(key => {
            return {
              key,
              error: 1,
            };
          });

          addSpecialCases(invalidRequests, expected, testSubject);

          for (const index in invalidRequests) {
            const actualResponse = await makeRequest(invalidRequests[index]);
            const actual = JSON.parse(actualResponse);

            expect(actual).toEqual(expected[index]);
          }
        });
      }
    });
  });
  
  describe('Forgotten files commands verification', function () {
    describe('getForgotten', function () {
      const createExpected = ({ key, error }) => {
        const urlPattern = 'http://localhost:8000/cache/files/forgotten/--key--/output.docx/output.docx';
        const invalidKeyReplacement = (key) => typeof key === 'string' ? key : '--not-existed--';

        return {
          key,
          error,
          url: key.map(id => urlPattern.replace('--key--', invalidKeyReplacement(id))).filter(url => !url.includes('/--not-existed--/'))
        }
      };

      const testCases = {
        'Single key': { key: [testFilesNames.get], error: 0 },
        'Multiple keys': { key: [testFilesNames.get, testFilesNames.delete1, testFilesNames.getList], error: 0 },
        'Not existed key': { key: ['--not-existed--'], error: 1 },
        'Partially existed keys': { key: ['--not-existed--', testFilesNames.get, testFilesNames.getList], error: 1 },
        'Invalid key': { key: [true], error: 1 },
        'Partially invalid keys': { key: [1, testFilesNames.get, null, testFilesNames.getList], error: 1 },
      };

      for (const testCase in testCases) {
        test(testCase, async () => {
          const requestBody = JSON.stringify({
            c: 'getForgotten',
            key: testCases[testCase].key
          })

          const actualResponse = await makeRequest(requestBody);

          const expected = createExpected(testCases[testCase]);
          const actual = JSON.parse(actualResponse);
          actual.url = actual.url.map(url => url.split('?')[0]);

          expect(actual).toEqual(expected);
        });
      }
    });

    describe('deleteForgotten', function () {
      const createExpected = ({ key, error }) => {
        const deleted = error === 1 ? [] : key;
        return {
          key,
          error,
          deleted
        };
      };

      const testCases = {
        'Single key': { key: [testFilesNames.delete1], error: 0 },
        'Multiple keys': { key: [testFilesNames.delete2, testFilesNames.delete3], error: 0 },
        'Not existed key': { key: ['--not-existed--'], error: 1 },
        'Partially existed keys': { key: ['--not-existed--', testFilesNames.get, testFilesNames.getList], error: 1 },
        'Invalid key': { key: [true], error: 1 },
        'Partially invalid keys': { key: [1, testFilesNames.get, null, testFilesNames.getList], error: 1 },
      };

      for (const testCase in testCases) {
        test(testCase, async () => {
          const requestBody = JSON.stringify({
            c: 'deleteForgotten',
            key: testCases[testCase].key
          });

          const alreadyExistedDirectories = getKeysDirectories(await storage.listObjects(ctx, '', cfgForgottenFiles));
          const directoriesToBeDeleted = testCases[testCase].error === 1 ? [] : testCases[testCase].key;
          const shouldExist = alreadyExistedDirectories.filter(directory => !directoriesToBeDeleted.includes(directory));

          const actualResponse = await makeRequest(requestBody);

          const expected = createExpected(testCases[testCase]);
          const actual = JSON.parse(actualResponse);

          const directoriesExistedAfterDeletion = getKeysDirectories(await storage.listObjects(ctx, '', cfgForgottenFiles));
          expect(actual).toEqual(expected);
          // Checking that files not existing on disk/cloud.
          expect(shouldExist).toEqual(directoriesExistedAfterDeletion);
        });
      }
    });
    
    describe('getForgottenList', function () {
      test('Main case', async () => {
        const requestBody = JSON.stringify({
          c: 'getForgottenList'
        });

        const stateBeforeChanging = await makeRequest(requestBody);
        const alreadyExistedDirectories = JSON.parse(stateBeforeChanging);

        const docId = 'DocService-DocsCoServer-forgottenFilesCommands-getForgottenList-2-integration-test';
        const buffer = Buffer.from('getForgottenList test file');
        await storage.putObject(ctx, `${docId}/${cfgForgottenFilesName}.docx`, buffer, buffer.length, cfgForgottenFiles);
        alreadyExistedDirectories.keys.push(docId);

        const actualResponse = await makeRequest(requestBody);
        const actual = JSON.parse(actualResponse);
        const expected = {
          error: 0,
          keys: alreadyExistedDirectories.keys
        }

        actual.keys?.sort();
        expected.keys.sort();
        expect(actual).toEqual(expected);
      });
    });
  });
});