import fetch from 'node-fetch';
//import fs from 'fs';
import path from 'path';
import fs from 'fs-extra';
import { performance } from 'perf_hooks';
import cliProgress from 'cli-progress';
import child_process from 'child_process';
import async from 'async';

import find from 'find';
import { fixUrlName } from './tilesTools';

export default function executeTileProcessing(
  topicname,
  inputFolder = '_in/_dev',
  outputFolder = '_out/_dev',
  tarOutputFolder = '_out/_dev',
  collectingFolder = '_out/thisWeek',
  parallelProcesses = 1,
  doneCallback = (error) => {
    if (error) {
      console.error('Error in executeTileProcessing', error);
    } else {
      console.log('Done with executeTileProcessing. No errors.');
    }
  }
) {
  //execute the conversion script for all pdfs in the input folder
  const cmds = [];
  //prepare
  find.file(/\.pdf$/, inputFolder, function (files) {
    let counter = 1;
    for (let file of files) {
      //file = file.replace(/(\s+)/g, '\\$1'); //this whitespace replacement conflicts with other whitespace handling
      let nameWithoutInputFolderPrefix = file.substr(inputFolder.length);
      let tarPathArr = (tarOutputFolder + fixUrlName(nameWithoutInputFolderPrefix)).split('/');
      tarPathArr.pop();
      let tarPath = tarPathArr.join('/');
      let cmd =
        './src/lib/c2t.sh "' +
        file +
        '" "' +
        outputFolder +
        fixUrlName(nameWithoutInputFolderPrefix) +
        '" && mkdir -p ' +
        tarPath +
        ' &&  tar cf ' +
        tarOutputFolder +
        fixUrlName(nameWithoutInputFolderPrefix) +
        '.tar ' +
        ' -C ' +
        outputFolder +
        ' ' +
        '.' +
        fixUrlName(nameWithoutInputFolderPrefix);
      console.log(counter + ':' + cmd);

      cmds.push({ cmd, counter, nameWithoutInputFolderPrefix });
      counter++;
    }
    async
      .eachLimit(cmds, parallelProcesses, (cmdo, done) => {
        let child = child_process.exec(cmdo.cmd, { stdio: 'inherit' }, done);
        child.stdout.on('data', (data) => {
          console.log(
            `[${cmdo.counter}/${cmds.length}]...${cmdo.nameWithoutInputFolderPrefix}: ${data}`
          );
        });

        child.stderr.on('data', (data) => {
          console.error(
            `[${cmdo.counter}/${cmds.length}]...${cmdo.nameWithoutInputFolderPrefix}: ${data}`
          );
        });
      })
      .then(doneCallback);
  });

  //copy the results to the output folder
}
