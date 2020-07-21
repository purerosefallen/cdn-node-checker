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
	retryCount: number;
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

const requestOption = {
	method: "POST"
}

class Checker {
	config: Config;
	client: Aliyun;
	cdnRecordsRegex: RegExp[];
	static order: number = 0;
	id: number;
	constructor(config: Config) {
		this.config = config;
		this.client = new Aliyun(config.aliyun);
		this.cdnRecordsRegex = config.cdnRecords.map(m => new RegExp(m.match));
		this.id = ++Checker.order;
	}
	private message(msg: string) {
		console.log(`${this.id} => ${msg}`);
	}
	async getRecords(): Promise<DomainRecordInfo[]> {
		console.log(`Fetching domain records of ${config.domain}.`)
		const res: DomainRecordInfo[] = [];
		for (let i = 1; ; ++i) {
			const ret: DomainRecordReturnResult = await this.client.request("DescribeDomainRecords", {
				DomainName: config.domain,
				PageNumber: i,
				PageSize: 500,
			}, requestOption);
			console.log(ret.TotalCount);
			if (!ret.DomainRecords.Record.length) {
				break;
			}
			for (let record of ret.DomainRecords.Record.filter(m => {
				return m.RR && m.Type === "CNAME" && _.any(this.cdnRecordsRegex, r => !!m.RR.match(r)) && _.every(this.cdnRecordsRegex, r => {
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
	async checkNode(address: string, port: number): Promise<boolean> {
		let currentTestDomain: string;
		for (let i = 1; i <= this.config.retryCount; ++i) {
			try {
				for (let testDomain of this.config.testDomains) {
					currentTestDomain = testDomain;
					await axios.get(`https://${address}:${port}`, {
						headers: {
							Host: testDomain
						},
						timeout: this.config.timeout,
						validateStatus: status => status < 500
					});
				}
				this.message(`Node ${address}:${port} is good.`);
				return true;
			} catch (e) {
				this.message(`Node ${address}:${port} Failed in checking ${currentTestDomain} ${i}: ${e.toString()}`);
			}
		}
		console.log(`Node ${address}:${port} is bad.`);
		return false;
	}
	async checkRecord(recordInfo: DomainRecordInfo) {
		const record = recordInfo.record;
		this.message(`Checking record ${record.RR}.${this.config.domain} ${record.Value}:${recordInfo.port} with old status of ${record.Status}.`)
		const status = record.Status;
		const targetStatus = (await this.checkNode(record.Value, recordInfo.port)) ? "ENABLE" : "DISABLE";
		if (status != targetStatus) {
			this.message(`Changing record status of ${record.RR}.${this.config.domain} ${record.Value}:${recordInfo.port} from ${status} to ${targetStatus}.`);
			await this.client.request("SetDomainRecordStatus", {
				RecordId: record.RecordId,
				Status: targetStatus
			}, requestOption);
		}
	}
	async start() {
		this.message(`Started.`);
		const records = await this.getRecords();
		await Promise.all(records.map(r => {
			return this.checkRecord(r);
		}));
		this.message(`Finished.`);
	}
}

async function run() {
	const checker = new Checker(config);
	await checker.start();
}

async function main() {
	config = YAML.parse(await fs.promises.readFile("./config.yaml", "utf8"));
	//await run();
	(new CronJob(config.cronString, run, null, true, "Asia/Shanghai", null, true)).start();
}

main();
