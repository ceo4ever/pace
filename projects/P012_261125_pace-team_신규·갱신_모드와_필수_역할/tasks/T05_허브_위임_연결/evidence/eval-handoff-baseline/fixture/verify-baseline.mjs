import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {searchWithinAccount} from "./src/search.ts";
const source=readFileSync("src/search.ts");
const data=readFileSync("test/search-cases.json");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const test=JSON.parse(data);
const rows=test.fixedQueries.map(query=>{
    const actual=searchWithinAccount(test.account,query,test.documents);
    return {query,returned:actual.map(doc=>doc.id),expected:test.expectedDocumentByQuery[query],
      found:actual.some(doc=>doc.id===test.expectedDocumentByQuery[query]),excludedOther:actual.every(doc=>doc.account===test.account)};
});
const hits=rows.filter(row=>row.found).length;
if(hits!==test.baselineTop3 || rows.some(row=>!row.excludedOther)) process.exit(1);
console.log(JSON.stringify({fixedQueryCount:rows.length,hits,minApproved:test.acceptedMinimum,
  shaSource:sha(source),shaData:sha(data),otherAccountExcluded:rows.every(row=>row.excludedOther),rows},null,2));
