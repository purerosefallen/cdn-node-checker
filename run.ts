import Aliyun from "@alicloud/pop-core";
import axios from "axios";
import _ from "underscore";
import YAML from "yaml";
import fs from "fs";
import {CronJob} from "cron";

interface CDNRecord {
	match: string;
	port: number;
}

interface Config {
	aliyun: Aliyun.Config;
	domain: string;
	cdnRecords: CDNRecord[];
	testDomains: string[];
	timeout: number;
	cronString: string;
}

interface DomainRecordObject {
	Record: DomainRecord[];
}

interface DomainRecordReturnResult {
	RequestId: string;
	TotalCount: number;
	PageNumber: number;
	PageSize: number;
	DomainRecords: DomainRecordObject;
}

interface DomainRecord {
	DomainName: string;
	RecordId: string;
	RR: string;
	Type: string;
	Value: string;
	TTL: number;
	Priority: number;
	Line: string;
	Status: string;
	Locked: boolean;
	Weight: number;
	Remark: string;
}

interface DomainRecordInfo {
	record: DomainRecord;
	port: number;
}

let config: Config;
let client: Aliyun;
let cdnRecordsRegex: RegExp[];

const requestOption = {
	method: "POST"
}

async function getRecords(): Promise<DomainRecordInfo[]> {
	console.log(`Fetching domain records of ${config.domain}.`)
	const res: DomainRecordInfo[] = [];
	for (let i = 1; ; ++i) {
		const ret: DomainRecordReturnResult = await client.request("DescribeDomainRecords", {
			DomainName: config.domain,
			PageNumber: i,
			PageSize: 500,
		}, requestOption);
		console.log(ret.TotalCount);
		if (!ret.DomainRecords.Record.length) {
			break;
		}
		for (let record of ret.DomainRecords.Record.filter(m => {
			return m.RR && m.Type === "CNAME" && _.any(cdnRecordsRegex, r => !!m.RR.match(r)) && _.every(cdnRecordsRegex, r => {
				if (!m.Value.endsWith(config.domain)) {
					return true;
				}
				const valuePrefix = m.Value.slice(0, m.Value.length - 1 - config.domain.length);
				return !valuePrefix.match(r);
			});
		})) {
			const port = _.find(config.cdnRecords, r => record.RR.match(r.match)).port;
			console.log(`Found record ${record.RR}.${config.domain} => ${record.Value}:${port}.`);
			res.push({record, port});
		}
	}
	return res;
}

async function checkNode(address: string, port: number): Promise<boolean> {
	let currentTestDomain: string;
	try {
		for (let testDomain of config.testDomains) {
			currentTestDomain = testDomain;
			await axios.get(`https://${address}:${port}`, {
				headers: {
					Host: testDomain
				},
				timeout: config.timeout,
				validateStatus: status => status < 500
			});
		}
		console.log(`Node ${address}:${port} is good.`);
		return true;
	} catch (e) {
		console.log(`Node ${address}:${port} is bad: ${currentTestDomain} => ${e.toString()}`);
		return false;
	}
}

async function checkRecord(recordInfo: DomainRecordInfo) {
	const record = recordInfo.record;
	console.log(`Checking record ${record.RR}.${config.domain} ${record.Value}:${recordInfo.port} with old status of ${record.Status}.`)
	const status = record.Status;
	const targetStatus = (await checkNode(record.Value, recordInfo.port)) ? "ENABLE" : "DISABLE";
	if (status != targetStatus) {
		console.log(`Changing record status of ${record.RR}.${config.domain} ${record.Value}:${recordInfo.port} from ${status} to ${targetStatus}.`);
		await client.request("SetDomainRecordStatus", {
			RecordId: record.RecordId,
			Status: targetStatus
		}, requestOption);
	}
}

async function run() {
	console.log(`Started.`);
	const records = await getRecords();
	await Promise.all(records.map(checkRecord));
	console.log(`Finished.`);
}

async function main() {
	config = YAML.parse(await fs.promises.readFile("./config.yaml", "utf8"));
	client = new Aliyun(config.aliyun);
	cdnRecordsRegex = config.cdnRecords.map(m => new RegExp(m.match));
	//await run();
	(new CronJob(config.cronString, run, null, true, "Asia/Shanghai", null, true)).start();
}

main();
