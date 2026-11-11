import fetch from 'node-fetch';
//import fs from 'fs';
import path from 'path';
import fs from 'fs-extra';
import cliProgress from 'cli-progress';
import produceExaminationPages from './examinationPages';
import { slack, config } from '../processing';

export function getTileCheckUrls(url, pages, pageNo, maxzoomlevel) {
	let ret = [];
	let between = '';
	if (pages > 1) {
		between = '-' + pageNo;
	}
	for (let zl = 0; zl < maxzoomlevel; ++zl) {
		ret.push(url + between + '/' + zl + '/0/0.png');
	}
	return ret;
}

export function fixUrlName(url) {
	return url
		.replace(/ /g, '_')
		.replace(/A\u0308/g, 'AE')
		.replace(/a\u0308/g, 'ae')
		.replace(/u\u0308/g, 'ue')
		.replace(/U\u0308/g, 'UE')
		.replace(/o\u0308/g, 'oe')
		.replace(/O\u0308/g, 'OE')
		.replace(/ä/g, 'ae')
		.replace(/ü/g, 'ue')
		.replace(/ö/g, 'oe')
		.replace(/Ä/g, 'AE')
		.replace(/Ü/g, 'UE')
		.replace(/Ö/g, 'OE')
		.replace(/ß/g, 'ss');
}

export function getDocFromUrl(url) {
	return { url, file: url.substring(url.lastIndexOf('/') + 1) };
}

export function getBaseUrl(doc_url) {
	return fixUrlName(
		doc_url
			.replace(/^http/, 'https')
			.replace(/^httpss/, 'https')
			.replace('https://www.wuppertal.de/geoportal/', 'https://aaa.cismet.de/tiles/')
	);
}

export async function getMetaInfoForUrl({ tileUrl, origUrl, fileSystemChecks = false }) {
	let response;
	if (!fileSystemChecks) {
		let status, content, origContentLength, origLastModified;
		try {
			response = await fetch(tileUrl + '/meta.json', {
				method: 'get',
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like ' +
						'Gecko) Chrome/56.0.2924.87 Safari/537.36'
				}
			});

			status = response.status;

			if (status === 200) {
				try {
					content = await response.json();
					if (config.sizeChecks === true || config.lastModifiedChecks === true) {
						const headResponse = await fetch(origUrl, { method: 'head' });
						if (config.sizeChecks === true) {
							origContentLength = headResponse.headers.get('Content-Length');
							if (content.contentLength !== origContentLength) {
								status = 303; //see other
								console.log(
									'set status 303 for ' +
										tileUrl +
										'/meta.json because of Content-Length Header mismatch'
								);
							}
						}
						if (config.lastModifiedChecks === true) {
							origLastModified = headResponse.headers.get('Last-Modified');
							if (content.lastModified !== origLastModified) {
								status = 303; //see other
								console.log(
									'set status 303 for ' +
										tileUrl +
										'/meta.json because of Last-Modified Header mismatch'
								);
							}
						}
					} else {
						console.log('no size and last modified check');
					}
				} catch (e) {
					status = 406; //Not Acceptable > no valid json
					console.log('set status 406 for ' + tileUrl + '/meta.json because of error', e);
				}
			} else if (status === 404 && origUrl !== undefined) {
				const headResponse = await fetch(origUrl, { method: 'head' });
				origContentLength = headResponse.headers.get('Content-Length');
				origLastModified = headResponse.headers.get('Last-Modified');
			}
			// console.log(tileUrl + '/meta.json: ', status);
			// console.log('return ', { status, content, origContentLength, origLastModified });

			return { status, content, origContentLength, origLastModified };
		} catch (e) {
			console.log('fetch error for ' + tileUrl + '/meta.json', e);
			status = 404;
			return { status, content, origContentLength, origLastModified };
		}
	} else {
		let file =
			tileUrl.replace('https://aaa.cismet.de/tiles/', './_tilesstoragemount/') + '/meta.json';

		if (fs.existsSync(file)) {
			response = {};
			response.status = 200;
			try {
				response.content = JSON.parse(fs.readFileSync(file, 'utf8'));
			} catch (e) {
				response.status = 406; //Not Acceptable > no valid json
			}
		} else {
			response = {};
			response.status = 404;
		}
		return { status: response.status, content: response.content };
	}
}
export async function checkUrlsSequentially(
	topicname,
	breaking = 0,
	tileChecking = false,
	fileSystemChecks = false,
	localCheckDump = false // good for debugging. if set to true you it will use old results
) {
	let correctionDownloads = [];
	let docsCounter = 0;
	let pageCounter = 0;
	let entityCounter = 0;
	let bar1;
	if (config.progressBar === true) {
		bar1 = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
	}
	let errors = [];
	let downloadErrors = [];
	let downloadsNeeded = '';
	let doclogs = {};
	let zoomlevelzerourls = [];
	let wgetConfig = {};
	let i = 0;

	if (!localCheckDump) {
		({
			pageCounter,
			docsCounter,
			entityCounter,
			errors,
			downloadErrors,
			downloadsNeeded,
			doclogs,
			zoomlevelzerourls,
			wgetConfig,
			correctionDownloads
		} = await getDataForTopic(topicname, bar1, breaking));

		fs.writeFileSync(
			'_internal/' + topicname + '_doclogs.json',
			JSON.stringify(doclogs, null, 2),
			'utf8'
		);
		fs.writeFileSync(
			'_internal/' + topicname + '_zoomlevelzerourls.json',
			JSON.stringify(zoomlevelzerourls, null, 2),
			'utf8'
		);
		for (let dl of correctionDownloads) {
			if (dl.endsWith('.pdf')) {
				console.log('::dl:', dl);
				console.log('::path.dirname:', path.dirname(dl));

				const dirKey = path
					.dirname(dl)
					.replace(/^https/, 'http')
					.replace('http://wunda-geoportal-docs.cismet.de/', '')
					.replace('http://aaa.cismet.de/tiles/static/files', '')
					.replace('http://www.wuppertal.de/geoportal/', '');
				console.log('::dirKey:', dirKey);

				if (!fs.existsSync('./_in/' + dirKey + '/' + path.basename(dl))) {
					if (wgetConfig[dirKey]) {
						wgetConfig[dirKey].push(dl);
					} else {
						wgetConfig[dirKey] = [ dl ];
					}
				}
			}
		}

		fs.writeFileSync(
			'_internal/' + topicname + '_wgetConfig.json',
			JSON.stringify(wgetConfig, null, 0),
			'utf8'
		);
	} else {
		doclogs = JSON.parse(fs.readFileSync('_internal/' + topicname + '_doclogs.json', 'utf8'));
		zoomlevelzerourls = JSON.parse(
			fs.readFileSync('_internal/' + topicname + '_zoomlevelzerourls.json', 'utf8')
		);
		if (!doclogs) {
			console.log('Could not read ' + topicname + '_doclogs.json. No need to continue.', e);
			process.exit(1);
		}
		wgetConfig = JSON.parse(
			fs.readFileSync('_internal/' + topicname + '_wgetConfig.json', 'utf8')
		);
		for (const key in wgetConfig) {
			correctionDownloads = correctionDownloads.concat(wgetConfig[key]);
		}
	}

	i = 0;
	let nofTilechecks = 0;

	for (const key in doclogs) {
		for (const pagekey in doclogs[key].tilecheckurls) {
			nofTilechecks += doclogs[key].tilecheckurls[pagekey].length;
		}
		i++;
		if (breaking && i >= breaking) {
			break;
		}
	}
	console.log('\n# tilechecks:' + nofTilechecks);
	let tileCheckingResult;
	if (tileChecking) {
		tileCheckingResult = await doTileChecking(
			nofTilechecks,
			doclogs,
			fileSystemChecks,
			breaking
		);
		tileCheckingResult.bar2.stop();
	}

	//produceExaminationPages('allDocumentsExamination', zoomlevelzerourls);

	const result = {
		docsCounter,
		entityCounter,
		pageCounter,
		errors,
		downloadErrors,
		wgetConfig,
		doclogs
	};
	console.log('');
	console.log(
		'checked ' +
			result.docsCounter +
			' documents of ' +
			result.entityCounter +
			' ' +
			topicname +
			'-objects with ' +
			result.pageCounter +
			' pages altogether'
	);
	console.log('result.errors', result.errors);

	const problemCounter = result.errors.length;
	if (problemCounter > 0) {
		console.log('found ' + problemCounter + ' problems.');
		slack(
			topicname,
			'Will try to fix ' +
				problemCounter +
				' missing or outdated ' +
				(problemCounter === 1 ? 'file.' : 'files.')
		);
	} else {
		console.log('no problems. everything seems to be fine');
	}
	if (result.downloadErrors.length > 0) {
		console.log('Download errors occured');
		for (const e of result.downloadErrors) {
			console.log(e);
		}
	}
	return result;
}

export async function getDataForTopic(
	topicname,
	bar1,
	breaking,
	metaInfCorrection = false,
	outputFolder
) {
	let correctionDownloads = [];
	let docsCounter = 0;
	let pageCounter = 0;
	let entityCounter = 0;
	let errors = [];
	let downloadErrors = [];
	let downloadsNeeded = '';
	let doclogs = {};
	let zoomlevelzerourls = [];
	let wgetConfig = {};
	let i = 0;

	let topicArr = topicname.split('#');

	switch (topicArr[0]) {
		case 'bplaene':
			{
				const bplc = await getBPlanDB();
				if (bplc === undefined) {
					process.exit(1);
				}
				if (config.progressBar === true) {
					bar1.start(breaking || bplc.length, 0);
				}
				for (const bpl of bplc) {
					entityCounter++;
					if (config.progressBar === true) {
						bar1.update(entityCounter);
					}

					let allUrls = bpl.m.plaene_rk.concat(bpl.m.plaene_nrk, bpl.m.docs);
					let docIndex = 0;
					let planSection = true;
					for (const doc of allUrls) {
						docsCounter++;
						if (planSection && bpl.m.docs.indexOf(doc) !== -1) {
							planSection = false;
							docIndex++; //increment index because of the describing meta document (first document after the real plans)
						}
						let testbaseurl = getBaseUrl(doc.url);

						let result = await getMetaInfoForUrl({
							tileUrl: testbaseurl,
							origUrl: doc.url
						});
						let status = result.status;

						if (status === 200 || (status === 303 && metaInfCorrection === true)) {
							let meta = result.content;
							let tilecheckurls = {};
							let tilecheckurl = getBaseUrl(doc.url);
							pageCounter += meta.pages;
							for (let i = 0; i < meta.pages; ++i) {
								tilecheckurls['page.' + i] = getTileCheckUrls(
									tilecheckurl,
									meta.pages,
									i,
									meta['layer' + i].maxZoom
								);
								let humantesturl = tilecheckurls['page.' + i][0];
								zoomlevelzerourls.push({
									bplan: bpl.s,
									doc,
									index: docIndex,
									page: i,
									humantesturl
								});
							}

							let tcobject = {
								doc,
								meta,
								testbaseurl,
								testbaseurlstatus: status,

								tilecheckurls,
								contentLength: result.origContentLength,
								lastModified: result.origLastModified
							};
							doclogs[doc.url] = tcobject;
						} else {
							if (testbaseurl.endsWith('.pdf')) {
								errors.push(testbaseurl + '/meta.json >> ' + status);
								//console.log(testbaseurl + '/meta.json) >> ' + status);

								correctionDownloads.push(doc.url);
								let tcobject = {
									doc,
									testbaseurl,
									testbaseurlstatus: status,
									contentLength: result.origContentLength,
									lastModified: result.origLastModified
								};
								doclogs[doc.url] = tcobject;
								downloadsNeeded = downloadsNeeded + doc.url + '\n';
							} else {
								console.log('\nwill ignore the != 200 status of ', testbaseurl);
							}
						}
						docIndex++;
					}
					i++;
					if (breaking && i >= breaking) {
						break;
					}
					if (errors.length > config.maxChanges && !metaInfCorrection) {
						slack(
							topicname,
							':rotating_light::rotating_light::rotating_light: Error limit is reached. Will ignore the rest. If you need more than ' +
								config.maxChanges +
								' errors corrected you need to set the `maxChanges`config higher and run the script again.'
						);
						break;
					}
				}
			}
			break;

		case 'aev':
			{
				let fnpAEV = await getAEVDB();
				if (config.progressBar === true) {
					bar1.start(breaking || fnpAEV.length, 0);
				}
				for (const aev of fnpAEV) {
					entityCounter++;
					if (config.progressBar === true) {
						bar1.update(entityCounter);
					}
					let allUrls = [ getDocFromUrl(aev.url) ];
					for (const durl of aev.docUrls) {
						allUrls.push(getDocFromUrl(durl));
					}
					let docIndex = 0;
					for (const doc of allUrls) {
						let testbaseurl = getBaseUrl(doc.url);
						let result = await getMetaInfoForUrl({
							tileUrl: testbaseurl,
							origUrl: doc.url
						});
						let status = result.status;

						if (status === 200 || (status === 303 && metaInfCorrection === true)) {
							let meta = result.content;
							if (metaInfCorrection) {
								// console.log('url', doc);
								// console.log('meta', meta);
							}

							let tilecheckurls = {};
							let tilecheckurl = getBaseUrl(doc.url);
							pageCounter += meta.pages;
							for (let i = 0; i < meta.pages; ++i) {
								tilecheckurls['page.' + i] = getTileCheckUrls(
									tilecheckurl,
									meta.pages,
									i,
									meta['layer' + i].maxZoom
								);
								let humantesturl = tilecheckurls['page.' + i][0];
								zoomlevelzerourls.push({
									aev: aev.name,
									doc,
									index: docIndex,
									page: i,
									humantesturl
								});
							}

							let tcobject = {
								doc,
								meta,
								testbaseurl,
								testbaseurlstatus: status,
								tilecheckurls,
								contentLength: result.origContentLength,
								lastModified: result.origLastModified
							};
							doclogs[doc.url] = tcobject;
						} else {
							if (testbaseurl.endsWith('.pdf')) {
								errors.push(testbaseurl + '/meta.json >> ' + status);
								//console.log(testbaseurl + '/meta.json) >> ' + status);

								correctionDownloads.push(doc.url);
								let tcobject = {
									doc,
									testbaseurl,
									testbaseurlstatus: status,
									contentLength: result.origContentLength,
									lastModified: result.origLastModified
								};
								doclogs[doc.url] = tcobject;
								downloadsNeeded = downloadsNeeded + doc.url + '\n';
							} else {
								console.log('\nwill ignore the != 200 status of ', testbaseurl);
							}
						}
						docIndex++;
					}
					i++;
					if (breaking && i >= breaking) {
						break;
					}

					if (errors.length > config.maxChanges && !metaInfCorrection) {
						slack(
							topicname,
							':rotating_light::rotating_light::rotating_light: Error limit is reached. Will ignore the rest. If you need more than ' +
								config.maxChanges +
								' errors corrected you need to set the `maxChanges`config higher and run the script again.'
						);
						break;
					}
				}
			}
			break;
		case 'static': {
			if (topicArr.length == 2) {
				const topicoption = topicArr[1];
				let docIndex = 0;

				const dicResponse = await fetch(
					'https://aaa.cismet.de/tiles/static/docs/' + topicoption + '.json'
				);
				let dic = await dicResponse.json();
				//console.log('static dicResponse.json', dic);
				let allUrls = [];
				if (config.progressBar === true) {
					bar1.start(breaking || dic.docs.length, 0);
				}
				for (const doc of dic.docs) {
					entityCounter++;
					if (config.progressBar === true) {
						bar1.update(entityCounter);
					}

					let testbaseurl = doc.url.replace(
						dic.tilereplacementrule[0],
						dic.tilereplacementrule[1]
					);

					let result = await getMetaInfoForUrl({
						tileUrl: testbaseurl,
						origUrl: doc.url
					});
					let status = result.status;
					if (status === 200 || (status === 303 && metaInfCorrection === true)) {
						let meta = result.content;
						let tilecheckurls = {};
						let tilecheckurl = testbaseurl;
						pageCounter += meta.pages;
						for (let i = 0; i < meta.pages; ++i) {
							tilecheckurls['page.' + i] = getTileCheckUrls(
								tilecheckurl,
								meta.pages,
								i,
								meta['layer' + i].maxZoom
							);
							let humantesturl = tilecheckurls['page.' + i][0];
							zoomlevelzerourls.push({
								name: doc.title,
								doc,
								index: docIndex,
								page: i,
								humantesturl
							});
						}

						let tcobject = {
							doc,
							testbaseurl,
							testbaseurlstatus: status,
							meta,
							tilecheckurls,
							contentLength: result.origContentLength,
							lastModified: result.origLastModified
						};

						doclogs[doc.url] = tcobject;
					} else {
						if (testbaseurl.endsWith('.pdf')) {
							errors.push(testbaseurl + '/meta.json >> ' + status);
							//console.log(testbaseurl + '/meta.json) >> ' + status);

							correctionDownloads.push(doc.url);
							let tcobject = {
								doc,
								testbaseurl,
								testbaseurlstatus: status,
								contentLength: result.origContentLength,
								lastModified: result.origLastModified
							};
							doclogs[doc.url] = tcobject;
							downloadsNeeded = downloadsNeeded + doc.url + '\n';
						} else {
							console.log('\nwill ignore the != 200 status of ', testbaseurl);
						}
					}
					docIndex++;
				}
			} else {
				slack(topicname, 'Error. Further information needed for `static` Topic.');
			}
		}
		default:
			break;
	}

	if (metaInfCorrection) {
		console.log('\n\n');
		// fs.outputFileSync(
		// 	outputFolder + 'doclogstmp.json',
		// 	JSON.stringify(doclogs, null, 2),
		// 	'utf8'
		// );
		for (const key of Object.keys(doclogs)) {
			const doc = doclogs[key].doc;

			//hier auf 303 prüfen
			if (doclogs[key].testbaseurlstatus === 303) {
				//	if (doc.file === 'B1044V.pdf') {
				//console.log('doclogs[key]', doclogs[key]);
				//console.log('url=', doc.url);
				let url;
				try {
					url = doc.url.replace(/^http:/, 'https:');
					// const response = await fetch(url, { method: 'HEAD' });
					// const cl = response.headers.get('Content-Length');
					// // console.log('Content-Length', cl);
					// const lm = response.headers.get('Last-Modified');
					// // console.log('Last-Modified', lm);

					doclogs[key].meta.contentLength = doclogs[key].contentLength;
					doclogs[key].meta.lastModified = doclogs[key].lastModified;
					//console.log(doc.url + '-->', doclogs[key].meta);
					//console.log('doc', doclogs[key]);

					let url4doc = doclogs[key].testbaseurl;

					const path =
						outputFolder +
						url4doc
							.replace(/^http:\/\/www.wuppertal.de\/geoportal/, '')
							.replace(/^https:\/\/www.wuppertal.de\/geoportal/, '')
							.replace('https://aaa.cismet.de/tiles', '')
							.replace('https://wunda-geoportal-docs.cismet.de', '') +
						'/meta.json';
					console.log('write ', path);

					fs.outputFileSync(path, JSON.stringify(doclogs[key].meta, null, 2), 'utf8');
				} catch (e) {
					console.log('error', e);

					console.log('error when fetching ' + url + ' (' + doc.url + ')');
				}
			}
		}
	}

	return {
		pageCounter,
		docsCounter,
		entityCounter,
		errors,
		downloadErrors,
		downloadsNeeded,
		doclogs,
		zoomlevelzerourls,
		wgetConfig,
		correctionDownloads
	};
}

export async function getDB(topicname, ignoreMD5) {
	if (topicname === 'bplaene') {
		return await getBPlanDB(ignoreMD5);
	} else if (topicname === 'aev') {
		return await getAEVDB(ignoreMD5);
	}
}

async function getBPlanDB(ignoreMD5) {
	const md5Response = await fetch(
		'https://wunda-geoportal.cismet.de/data/bplaene.tiling.data.json.md5',
		{
			method: 'get',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like ' +
					'Gecko) Chrome/56.0.2924.87 Safari/537.36',
				'Cache-Control': 'no-cache'
			}
		}
	);
	let status = await md5Response.status;
	let webMD5;
	if (status === 200) {
		try {
			webMD5 = await md5Response.text();
		} catch (e) {
			console.log('Could not download bplaene.tiling.data.json.md5. No need to continue.', e);
			return undefined;
		}
	}

	let storedMD5;
	try {
		storedMD5 = fs.readFileSync('_internal/bplaene.tiling.data.json.md5', 'utf8');
	} catch (e) {
		storedMD5 = '';
	}
	let content;

	if (webMD5 === storedMD5) {
		console.log('Will get PlanDump from cache.');

		content = JSON.parse(fs.readFileSync('_internal/bplaene.tiling.data.json', 'utf8'));
	} else {
		console.log('Will get PlanDump online.');

		const response = await fetch(
			'https://wunda-geoportal.cismet.de/data/bplaene.tiling.data.json',
			{
				method: 'get',
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like ' +
						'Gecko) Chrome/56.0.2924.87 Safari/537.36'
				}
			}
		);

		let status = await response.status;
		if (status === 200) {
			try {
				content = await response.json();
			} catch (e) {
				console.log('Could not download bplaene.tiling.data.json. No need to continue.', e);
				return undefined;
			}
		}
		fs.writeFileSync(
			'_internal/bplaene.tiling.data.json',
			JSON.stringify(content, null, 2), //one line: JSON.stringify(content, null, 0)
			'utf8'
		);
		fs.writeFileSync('_internal/bplaene.tiling.data.json.md5', webMD5, 'utf8');
	}
	return content;
}

async function getAEVDB(ignoreMD5) {
	const md5Response = await fetch(
		'https://wunda-geoportal.cismet.de/data/aenderungsv.data.json.md5',
		{
			method: 'get',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like ' +
					'Gecko) Chrome/56.0.2924.87 Safari/537.36',
				'Cache-Control': 'no-cache'
			}
		}
	);
	let status = await md5Response.status;
	let webMD5;
	if (status === 200) {
		try {
			webMD5 = await md5Response.text();
		} catch (e) {
			console.log(
				'Could not download https://wunda-geoportal.cismet.de/data/aenderungsv.data.json.md5. No need to continue.',
				e
			);
			return undefined;
		}
	}

	let storedMD5;
	try {
		storedMD5 = fs.readFileSync('_internal/aenderungsv.data.json.md5', 'utf8');
	} catch (e) {
		storedMD5 = '';
	}
	let content;

	if (webMD5 === storedMD5) {
		console.log('Will get AEVDump from cache.');

		content = JSON.parse(fs.readFileSync('_internal/aenderungsv.data.json', 'utf8'));
	} else {
		console.log('Will get AEVDump online.');

		const response = await fetch(
			'https://wunda-geoportal.cismet.de/data/aenderungsv.data.json',
			{
				method: 'get',
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like ' +
						'Gecko) Chrome/56.0.2924.87 Safari/537.36'
				}
			}
		);

		let status = await response.status;
		if (status === 200) {
			try {
				content = await response.json();
			} catch (e) {
				console.log('Could not download bplaene_complete.json. No need to continue.', e);
				return undefined;
			}
		}
		fs.writeFileSync(
			'_internal/aenderungsv.data.json',
			JSON.stringify(content, null, 0),
			'utf8'
		);
		fs.writeFileSync('_internal/aenderungsv.data.json.md5', webMD5, 'utf8');
	}
	return content;
}

export async function fixExistingMetaInfoAfterTiling(outfolder, topicname, doclogs) {
	for (const key in doclogs) {
		if (doclogs[key].testbaseurlstatus !== 200 && doclogs[key].testbaseurlstatus !== 406) {
			let file;
			try {
				const testbaseurl = doclogs[key].testbaseurl;
				const folder = testbaseurl.replace('https://aaa.cismet.de/tiles', '');
				file = outfolder + folder + '/meta.json';
				const meta = fs.readJsonSync(file);
				meta.contentLength = doclogs[key].contentLength;
				meta.lastModified = doclogs[key].lastModified;
				// console.log('correct meta info', meta);

				fs.writeFileSync(
					outfolder + folder + '/meta.json',
					JSON.stringify(meta, null, 0),
					'utf8'
				);
			} catch (e) {
				console.log('error when trying to fix ' + file);
			}
		}
	}
}

async function doTileChecking(topicname, nofTilechecks, doclogs, fileSystemChecks, breaking) {
	let tilechecks = [];

	//counting
	let i = 0;
	let bar2 = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
	bar2.start(nofTilechecks, 0);
	let tilecheckCounter = 0;
	for (const key in doclogs) {
		for (const pagekey in doclogs[key].tilecheckurls) {
			for (const tileCheckUrl of doclogs[key].tilecheckurls[pagekey]) {
				let resultTC;
				try {
					if (!fileSystemChecks) {
						resultTC = await fetch(tileCheckUrl, {
							method: 'get',
							headers: {
								'User-Agent':
									'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like ' +
									'Gecko) Chrome/56.0.2924.87 Safari/537.36'
							}
						});
					} else {
						let filename = tileCheckUrl.replace(
							'https://aaa.cismet.de/tiles/',
							'./_tilesstoragemount/'
						);
						//console.log('filecheck', filename);

						if (fs.existsSync(filename)) {
							resultTC = {};
							resultTC.status = 200;
						} else {
							resultTC = {};
							resultTC.status = 404;
						}
					}
				} catch (e) {
					resultTC = {};
					resultTC.status = 499;
					console.log('Fehler', e);
					break;
				}

				bar2.update(++tilecheckCounter);
				let tcstatus = resultTC.status;
				if (tcstatus !== 200) {
					let tcobject = {
						bplan: doclogs[key].doc,
						page: pagekey,
						url: tileCheckUrl,
						status: tcstatus
					};
					tilechecks.push(tcobject);
					if (correctionDownloads.indexOf(tcobject.bplan.url) === -1) {
						correctionDownloads.push(tcobject.bplan.url);
					}
					break;
				}
			}

			//console.log(doclogs[key].tilecheckurls);
		}
		i++;
		if (breaking && i >= breaking) {
			break;
		}
	}

	fs.writeFileSync('_internal/tilechecks.json', JSON.stringify(tilechecks, null, 2), 'utf8');
	return { bar2 };
}
