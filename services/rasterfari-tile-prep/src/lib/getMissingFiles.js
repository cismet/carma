import fetch from 'node-fetch';
//import fs from 'fs';
import path from 'path';
import fs from 'fs-extra';
import { performance } from 'perf_hooks';
import cliProgress from 'cli-progress';
import { execSync } from 'child_process';
import { slack } from '../processing';

export default function getMissingFiles(topicname, wgetConfig, folder = '.') {
	if (wgetConfig == undefined) {
		wgetConfig = JSON.parse(fs.readFileSync('./_internal/wgetConfig.json', 'utf8'));
	}

	for (const key in wgetConfig) {
		const dir = './_in/' + folder + '/' + key;
		fs.ensureDirSync(dir);
		fs.emptyDirSync(dir);

		console.log('in', key);

		const wgetList = '';
		for (const url of wgetConfig[key]) {
			wgetList = wgetList + url + '\n';
		}
		const fname = dir + '/' + 'wgetConfig.urls.txt';

		fs.writeFileSync(fname, wgetList, 'utf8');
		console.log('written ', fname);
		try {
			execSync('wget -q -i wgetConfig.urls.txt ', {
				cwd: dir
			});
			console.log('downloaded');
			console.log(' ------------');
			console.log(wgetList);
			console.log(' ------------');

			execSync('rm wgetConfig.urls.txt ', {
				cwd: dir
			});
			console.log('all good will delete wgetConfig.urls.txt');
		} catch (e) {
			console.log('error on wget from ' + fname);
			console.log(' ------------');
			console.log(wgetList);
			console.log(' ------------');
			slack(topicname, 'Error during `wget` one of these files: ' + wgetList);
			slack(topicname, '... trying to go on.');
		}
	}
}
