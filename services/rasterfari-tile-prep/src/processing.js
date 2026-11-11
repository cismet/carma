import { performance } from 'perf_hooks';
import {
  checkUrlsSequentially,
  getDataForTopic,
  fixExistingMetaInfoAfterTiling,
} from './lib/tilesTools';
import tiler from './lib/gdalTiling';
import { produceExaminationPagesFromTilesFolder } from './lib/examinationPages';
import { execSync } from 'child_process';
import cliProgress from 'cli-progress';
import fs from 'fs-extra';

import wgetFiles from './lib/getMissingFiles';
import program from 'commander';

const defaultConfig = {
  slackEnabled: false,
  slackChannel: 'dev_helllth',
  sizeChecks: true,
  lastModifiedChecks: true,
  maxChanges: 50,
  progressBar: true,
};
const loadedConfig = fs.readJsonSync('config.json');
export const config = {
  ...defaultConfig,
  ...loadedConfig,
};
console.log('--------- config');
console.log(JSON.stringify(config, null, 2));
console.log('--------- ');

function yyyymmdd() {
  let x = new Date();
  let y = x.getFullYear().toString();
  let m = (x.getMonth() + 1).toString();
  let d = x.getDate().toString();
  d.length == 1 && (d = '0' + d);
  m.length == 1 && (m = '0' + m);
  let hh = x.getHours() + '';
  hh.length == 1 && (hh = '0' + hh);
  let mm = x.getMinutes() + '';
  mm.length == 1 && (mm = '0' + mm);

  const yyyymmdd = y + m + d + '.' + hh + mm;

  return yyyymmdd;
}

const bye = (topicname) => {
  const msg = 'done (' + Math.round(performance.now() - start) / 1000 + ' s)';
  console.log(msg);
  slack(topicname, msg);

  console.log('\ndone will exit');
  process.exit(0);
};

const today = yyyymmdd();

let start = performance.now();

program.version('0.9.3').option('-v,--verbose', 'verbose output');

program
  .command('checkAndPrint')
  .description('check for missing Plan Documents')
  .option(
    '-l --limit <number of docs>',
    'Stop after <number of docs> Documents (all Documents if not set)',
    0
  )
  .option('-t --tileChecking', 'Check the 0/0 tile on each zoom level', false)
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(function (command) {
    const tileChecking = command.tileChecking || false;
    const limit = command.limit || 0;
    checkUrlsSequentially(command.topicname, limit, tileChecking).then((result) => {
      bye(command.topicname);
    });
  });
program
  .command('checkAndRetrieve')
  .description('check for missing Plan Documents and download them to the given folder')
  .option(
    '-l --limit [number of docs]',
    'Stop after [number of docs] Documents (all Documents if not set)'
  )
  .option('-t --tileChecking', 'Check the 0/0 tile on each zoom level')
  .option(
    '-d --subDir [dirname]',
    'Store the retrieved docs in a subfolder named [dirname]. [date] if not set'
  )
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(function (command) {
    const tileChecking = command.tileChecking || false;
    const limit = command.limit || 0;
    const dirname = command.dirname || today;
    const topicname = command.topicname;
    checkUrlsSequentially(topicname, limit, tileChecking).then((result) => {
      console.log('try to download the missing documents');
      wgetFiles(topicname, result.wgetConfig, dirname);
      bye(topicname);
    });
  });

program
  .command('tile')
  .description('do the tiling')
  .option('--in [folder]', 'input folder (_in/[date] when not set)')
  .option('--out [folder]', 'output folder (_out/[date] when not set)') //.option('-c --collecting [folder]', 'collecting folder');
  .option('--maxProcesses [max processes]', 'maximum of parallel tiling processes (1 when not set)')
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(function (command) {
    const topicname = command.topicname;

    const inputFolder = command.in || '_in/' + today;
    const outputFolder = command.out || '_out/' + today + '.' + topicname;
    const tarOutputFolder = command.out || '_tarout/' + today + '.' + topicname;
    const maxProcesses = command.maxProcesses || 1;
    const collectingFolder = undefined;
    tiler(
      topicname,
      inputFolder,
      outputFolder,
      tarOutputFolder,
      collectingFolder,
      maxProcesses,
      () => {
        console.log('Done with tiling :-)');
      }
    );
  });

program
  .command('checkRetrieveAndTile')
  .description(
    'check for missing Plan Documents and download them to the given folder. then start the tiler'
  )
  .option(
    '-l --limit [number of docs]',
    'Stop after [number of docs] Documents (all Documents if not set)'
  )
  .option('-t --tileChecking', 'Check the 0/0 tile on each zoom level')
  .option(
    '-d --subDir [dirname]',
    'Store the retrieved docs in a subfolder named [dirname]. [date] if not set'
  )
  .option('-o --out [folder]', 'output folder (_out/[date] when not set)') //.option('-c --collecting [folder]', 'collecting folder');
  .option(
    '-p --maxProcesses [max processes]',
    'maximum of parallel tiling processes (1 when not set)'
  )
  .option('-u --upload', 'upload the produced stuff after the tiling')
  .option('-i --checkIn [folder]', 'input folder (_in/[date] when not set)')
  .option('-c --checkOut [folder]', 'output folder (_out/[date]/checks/[date] when not set)')
  .option('-s --skipChecks', 'skip the checkFolder creation')
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(function (command) {
    console.log('doing stuff for ', command.topicname);
    const topicname = command.topicname;

    const tileChecking = command.tileChecking || false;
    const limit = command.limit || 0;
    const dirname = command.dirname || today + '.' + topicname;

    const inputFolder = '_in/' + dirname;
    const outputFolder = command.out || '_out/' + today + '.' + topicname;
    const tarOutputFolder = command.out || '_tarout/' + today + '.' + topicname;

    const maxProcesses = command.maxProcesses || 1;
    const collectingFolder = undefined;
    const upload = command.upload || false;
    const skipChecks = command.skipChecks || false;

    slack(topicname, 'Start processing ...');

    checkUrlsSequentially(topicname, tileChecking).then((result) => {
      console.log('try to download the missing documents');
      if (
        result.wgetConfig.constructor === Object &&
        Object.entries(result.wgetConfig).length > 0
      ) {
        wgetFiles(topicname, result.wgetConfig, dirname);

        tiler(
          topicname,
          inputFolder,
          outputFolder,
          tarOutputFolder,
          collectingFolder,
          maxProcesses,
          async (error) => {
            if (error) {
              console.log('errors during tiling. have a look.', error);
              slack(topicname, 'Errors during tiling. Have a look at the logs.');
            } else {
              slack(topicname, 'Tiling done. No Errors');
              //fixing the metainf
              await fixExistingMetaInfoAfterTiling(outputFolder, topicname, result.doclogs);

              console.log('Produce the Checkfolder');
              const checkInputFolder = command.checkIn || '_out/' + today + '.' + topicname;
              const checkOutputFolder =
                command.checkOut ||
                '_out/' + today + '.' + topicname + '/checks/' + today + '.' + topicname;
              await produceExaminationPagesFromTilesFolder(
                topicname,
                checkInputFolder,
                checkOutputFolder
              );
            }

            if (upload) {
              let inputFolderUpload = '_out/' + dirname;
              if (fs.existsSync(inputFolderUpload)) {
                inputFolderUpload = inputFolderUpload + '/*';
                const uploadFolder = '_tilesstoragemount/';
                const cmd = `cp -r ${inputFolderUpload} ${uploadFolder}`;
                console.log('cmd to upload tiles', cmd);
                execSync(cmd);
                slack(topicname, 'Files uploaded. Done.');
                //now the tars
                if (fs.existsSync(tarOutputFolder)) {
                  const uploadTarFolder = '_tartilesstoragemount/';
                  const cmd = `cp -r ${tarOutputFolder}/* ${uploadTarFolder}`;
                  console.log('cmd to upload tars', cmd);
                  execSync(cmd);
                  slack(topicname, 'Files uploaded. Done.');
                }
              } else {
                console.log('No files present to upload in ' + inputFolderUpload);

                slack(topicname, 'No files present to upload. Done.');
              }
            }

            bye(topicname);
          }
        );
      } else {
        slack(topicname, 'No errors => no wget => no tiling :wink:');
        console.log('No errors => no wget => no tiling ;-)');
        bye(topicname);
      }
    });
  });

program
  .command('produceChecks')
  .description('produces a set of html files to visually check the new tiles')
  .option('-i --in [folder]', 'tiles folder (_out/[date] when not set)')
  .option('-o --out [folder]', 'output folder (_out/[date]/checks/[date] when not set)') //.option('-c --collecting [folder]', 'collecting folder');
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(async function (command) {
    const topicname = command.topicname;
    const inputFolder = command.in || '_out/' + today + '.' + topicname;

    const outputFolder = command.out || '_out/' + today + '.' + topicname + '/checks/' + today;

    await produceExaminationPagesFromTilesFolder(topicname, inputFolder, outputFolder);
  });
program
  .command('upload')
  .description('uploads the new tiles to the tileserver')
  .option('-i --in [folder]', 'input folder (_in/[date] when not set)')
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(function (command) {
    const topicname = command.topicname;
    const inputFolder = command.in || '_out/' + today + '.' + topicname + '/*';
    if (fs.existsSync(inputFolder)) {
      const outputFolder = '_tilesstoragemount/';
      const dir = fs.readdirSync(inputFolder);
      const cmd = `cp -r ${inputFolder} ${outputFolder}`;
      console.log('cmd', cmd);
      execSync(cmd);
    } else {
      console.log('no content to copy in ' + inputFolder);
    }
  });
program
  .command('fixmeta')
  .description('downloads the meta.json files and add inject ts and size of original doc')
  .option('-o --out [folder]', 'output folder (_out/[date]/checks/[date] when not set)')
  .option('--topicname [topic]', 'the name of topic the processing should be done for')
  .action(function (command) {
    const go = async () => {
      const topicname = command.topicname;

      const outputFolder = command.out || '_out/' + today + '.' + topicname + '.metainfcorrection';

      console.log('topicname', topicname);
      console.log('outputFolder', outputFolder);
      let correctionDownloads = [];
      let docsCounter = 0;
      let pageCounter = 0;
      let entityCounter = 0;
      const bar1 = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
      let errors = [];
      let downloadErrors = [];
      let downloadsNeeded = '';
      let doclogs = {};
      let zoomlevelzerourls = [];
      let wgetConfig = {};
      let i = 0;
      let breaking = 0;

      const metaInfCorrection = true;
      await ({
        pageCounter,
        docsCounter,
        entityCounter,
        errors,
        downloadErrors,
        downloadsNeeded,
        doclogs,
        zoomlevelzerourls,
        wgetConfig,
        correctionDownloads,
      } = getDataForTopic(topicname, bar1, breaking, metaInfCorrection, outputFolder));

      bye(topicname);
    };

    go();
  });
// case 'checkRetrieveAndTile': {
// 	if (args.length > 1) {
// 		parallelThreads = args[1];
// 	}

// 	console.log('not supported yet');

// 	break;
// }
// case 'checkRetrieveTileAndUpload': {
// 	console.log('not supported yet');
// 	break;
// }

export function slack(topicname, msg) {
  let topicPrefix;
  let host = '';

  if (topicname === 'bplaene') {
    topicPrefix = ':blue_book: B-Pläne: ';
  } else if (topicname === 'aev') {
    topicPrefix = ':green_book: Änderungsverfahren: ';
  } else {
    topicPrefix = ':notebook: Statische Dokumente: ';
  }

  const cmd = `src/lib/slack  -i ":rasterfari:" -m "${topicPrefix}${msg}" -c "${config.slackChannel}" -u "Rasterfari Tile Prepper ${host}"`;
  if (config.slackEnabled === true) {
    execSync(cmd);
  } else {
    console.log('####### ' + msg);
  }
}

//

program.parse(process.argv);
