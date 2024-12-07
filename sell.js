import { OpenSeaSDK, Network, OpenSeaSDKError } from "@opensea/seaport-js";
const HDWalletProvider = require("@truffle/hdwallet-provider");
const fs = require("fs");
const random = require("random");
const Logger = require("./logger");

require("dotenv").config();

const MNEMONIC = process.env.MNEMONIC;
const INFURA_KEY = process.env.INFURA_KEY;
const OWNER_ADDRESS = process.env.OWNER_ADDRESS;
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS; 
const NETWORK = process.env.NETWORK;
const API_KEY = process.env.API_KEY;

const PROJECT_NAME = "Cyber Ape Frens";
const LIST_TIMEOUT = 86400; //#24h-> sec

Logger.info("==========================KEYS===============================");
Logger.warn(`MNEMONIC = ${MNEMONIC}`);
Logger.warn(`NODE_API_KEY = ${INFURA_KEY}`);
Logger.warn(`NFT_CONTRACT_ADDRESS = ${NFT_CONTRACT_ADDRESS}`);
Logger.warn(`OWNER_ADDRESS = ${OWNER_ADDRESS}`);
Logger.warn(`NETWORK = ${NETWORK}`);
Logger.warn(`API_KEY = ${API_KEY}`);
Logger.info("=============================================================");

// setting
var current_index = 0;
var err_retrycount = 0;
var tokens = [];
var cyclelist = true;

const RETRY_COUNT = 2;
const listforever = false;
const listTime = 1440; //m
const intervalTime = 3000; //12000 //18000; //ms
const listing_time = 0; 

let max_price = process.env.MAX_PRICE || 0.1;
let min_price = process.env.MIN_PRICE || 0.012;

max_price = parseFloat(max_price);
min_price = parseFloat(min_price);

if(isNaN(max_price) || isNaN(min_price)) return Logger.err("max price or min price is not a number");

Logger.info("===========================SETTINGS==========================");
Logger.warn(`LIST FOREVER = ${listforever}`);
Logger.warn(`LIST TIME = ${listTime}`);
Logger.warn(`INTERVAL TIME = ${intervalTime}`);
Logger.warn(`MIN PRICE = ${min_price}`);
Logger.warn(`MAX PRICE = ${max_price}`);
Logger.info("=============================================================");

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

const provider = new HDWalletProvider({
    mnemonic: {
        phrase: MNEMONIC
    },
    providerOrUrl: "https://mainnet.infura.io/v3/" + INFURA_KEY,
    timeoutBlocks: 200
});

const openseaSDK = new OpenSeaSDK(provider, {
    networkName: Network.Main,
    apiKey: API_KEY
}, Logger.opensea);

function isFileExisted(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            return true;
        }
        return false;
    } catch (e) {
        Logger.err(e);
        return false;
    }
}

function readLines(filepath) {
    var lines = [];
    var allFileContents = fs.readFileSync(filepath, "utf-8");
    allFileContents.split(/\r?\n/).forEach(line => {
        if (line == "") {
            return;
        }
        lines.push(line);
    // Logger.info(`Line from file: ${line}`);
    });
    return lines;
}

//list index
function recordListIndex(list_index) {
    try {
        fs.writeFileSync(PROJECT_NAME + "_last_request.id", list_index.toString());
    } catch (e) { 
        Logger.err(e); 
    }
}

function loadListIndex() {
    if (isFileExisted(PROJECT_NAME + "_last_request.id")) {
        var cachedContext = fs.readFileSync(PROJECT_NAME + "_last_request.id", "utf-8");
        try {
            if (cachedContext != undefined)
                current_index = parseInt(cachedContext);
        }
        catch (e) {
            Logger.err(`existsSync ${e}`);
        }
    }
}

//time
function record_list_time(token) {
    if (token=="") return;

    let sec = Math.floor(Date.now() / 1000);
    let date = new Date(Date.now());
    let datestr = date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
    let str = token + "#" + sec + "#" + datestr;

    let filepath =  `${PROJECT_NAME}-record-list-token.json`;
    if (isFileExisted(filepath) == false) {
        fs.writeFileSync(filepath, "");
    }

    let lines = readLines(filepath);
    let ischange = false;
    for (let index = 0; index < lines.length; index++) {
        arr = lines[index].replace("\n", "").replace("\r", "").split("#");
        if (arr.length >= 1 && token == arr[0]) {
            lines[index] = str;
            ischange = true;
            break;
        }
    }

    if (!ischange) lines.push(str);

    fs.truncateSync(filepath, -1);
    lines.forEach(line => {
        fs.appendFileSync(filepath, line + "\n");
    });
}

function check_list_time(token) {
    if (token == "") return true;

    filepath = `${PROJECT_NAME}-record-list-token.json`;
    if (isFileExisted(filepath) == false) {
        fs.writeFileSync(filepath, "");
    }
    record_time = 0;
    lines = readLines(filepath);
    for (let index = 0; index < lines.length; index++) {
        arr = lines[index].replace("\n", "").replace("\r", "").split("#");
        if (arr.length >= 1 && token == arr[0]) {
            record_time = parseInt(arr[1]);
            break;
        }
    }

    sec = Math.floor(Date.now() / 1000);
    offset = sec - record_time;
    if (offset > LIST_TIMEOUT) return true;
 
    Logger.check(`check list time fail token: ${token}, left time: ${LIST_TIMEOUT-offset}`);
    return false;
}

///start
async function main() {
    const price = random.float((min_price), (max_price)).toFixed(3);

    const current_time = Date.now()/1000;
    let expirationTime = Math.round(current_time + 60 * listTime);
    let listingTime = undefined;

    if (listing_time > 0) listingTime = Math.round(current_time + 60 * listing_time);
    if (current_index >= tokens.length) current_index = 0;

    try {
        const tokenId = tokens[current_index].toString();

        if (listforever) expirationTime = 0;
        if (!check_list_time(tokenId)) {
            await wait(60000);
            current_index += 0;
            main();
            return;
        }
    
        Logger.info(`Start list: expirationTime: ${expirationTime}, tokenId: ${tokenId}, current_time: ${current_time}, current_index: ${current_index}`);
        console.log(expirationTime);
        const fixedPriceSellOrder = await openseaSDK.createSellOrder({
            asset: {
                tokenId: tokenId,
                tokenAddress: NFT_CONTRACT_ADDRESS
            },
            startAmount: price,
            expirationTime: expirationTime,
            accountAddress: OWNER_ADDRESS,
            listingTime: listingTime,
            paymentTokenAddress: "0x0000000000000000000000000000000000000000" // ETH
        });

        Logger.success(`Successfully created a order! tokenId: ${tokenId}, cost sec = ${(Date.now()/1000 - current_time).toFixed(2)}, current_index: ${current_index}` );
    
        if (current_index >= tokens.length) {
            current_index = 0;
        } else {
            current_index += 1;
        }

        recordListIndex(current_index);
        record_list_time(tokenId);
        err_retrycount = 0;
        if (intervalTime > 0) {
            await wait(intervalTime);
        }

    } catch (e) {
        if (e instanceof OpenSeaSDKError) {
            Logger.err(`OpenSea SDK Error: ${e.message}, err_retrycount: ${err_retrycount}, current_index: ${current_index}`);
        } else {
            Logger.err(`Unexpected error: ${e}, err_retrycount: ${err_retrycount}, current_index: ${current_index}`);
        }
        err_retrycount += 1;
        if (err_retrycount > RETRY_COUNT) {
            if (current_index >= tokens.length) {
                current_index = 0;
            } else {
                current_index += 1;
            }
            err_retrycount = 0;
            await wait(15000);
        }
    }

    if (!cyclelist && current_index == 0)
        process.exit();

    main();
}

async function start() {
    loadListIndex();
    tokens = readLines(`${PROJECT_NAME}-tokens.json`);
    await wait(2000); //5000 //msz
    main().catch(err => {
        Logger.err(`Main error: ${err}`);
    });
}

start();