//
// functions to get logged in & send data.
//

if(typeof browser === "undefined") {
    var browser = chrome;
}

var eventQueue = [];
var processingqueue = false;

// Send a message object to the content script.
async function sendContentMessage(msgObject)
{
	await browser.tabs.query({currentWindow: true, active: true},
		async function(tabs) {
			if(tabs.length > 0)
				await browser.tabs.sendMessage(tabs[0].id, msgObject);
		}
	);
}

var storage_location = browser.storage.local;
if(browser.storage.session && typeof(browser.storage.session) !== "undefined")
{
	storage_location = browser.storage.session;
}

const loggedMessageTypes = ["SITE_SITES", "STORAGE_STORAGES", "WAREHOUSE_STORAGES", "WORKFORCE_WORKFORCES", "CONTRACTS_CONTRACTS", "CONTRACTS_CONTRACT", "PRODUCTION_SITE_PRODUCTION_LINES", "COMPANY_DATA", "FOREX_TRADER_ORDERS", "COMEX_TRADER_ORDERS", "STORAGE_CHANGE", "COMPANY_DATA"];

async function ProcessEvent(eventdata, event_list, full_event)
{
	//console.log("Processing Event");
	// Testing code
	/*
	const badTypes = ["ACTION_COMPLETED", "DATA_DATA", "CHANNEL_DATA", "CHANNEL_USER_LIST"];
	if(eventdata && !badTypes.includes(eventdata.messageType))
	{
		console.log(eventdata.messageType);
		console.log(eventdata);
	}
	*/
	
	// Detect bad events
	if (typeof eventdata === undefined || eventdata === null || typeof (eventdata.messageType) === "undefined")
	{
		return;
	}
	
	//console.debug(eventdata);
	
	// Log Events into Storage
	if(eventdata && eventdata.messageType && loggedMessageTypes.includes(eventdata.messageType))
	{
		//console.log("Logging Event into Storage");
		getLocalStorage("PMMG-User-Info", logEvent, eventdata);
		await sleep(100);
		return;
	}
	
	// Process Events
	if (eventdata.messageType in event_list)
	{
		console.debug("Event to process: " + eventdata.messageType);
		if(typeof full_event === "undefined")
		{
			full_event = eventdata;
		}
		var match_event = event_list[eventdata.messageType];
		if(typeof match_event === "undefined") {
			console.error("messagetype should be in list, but we still failed?");
		}

		if(match_event.action == "subprocess_payload")
		{
			//console.log("Processing Subevent")
			await ProcessEvent(eventdata.payload.message, match_event.payload_events, full_event);
		}
	}
	else
	{
		//console.debug("Event not found: " + eventdata.messageType);
	}

}

function ProcessMessage(event)
{
	//console.log("Processing Mesage");
	var outmsg = '';
	// Do stuff with event.data (received data).
	var re_event = /^[0-9:\s]*(?<event>\[\s*"event".*\])[\s0-9:\.]*/m;
    //console.log(re_event);
    //console.log(event.data);
	var result = event.data.match(re_event);
    //console.log(result);
	if (result && result.groups && result.groups.event)
	{
		var eventdata = JSON.parse(result.groups.event)[1];
		//console.log("Event found");
		//console.log(eventdata);
		//console.log("Queueing Event");
		QueueEvent(eventdata, transmitted_events);
    }
}

async function QueueEvent(eventdata)
{
	//console.debug("Queue event; eventQueue.size " + eventQueue.length);
	//console.debug("Queue event; processing? " + processingqueue);

	eventQueue.push(eventdata);
	if (processingqueue === false)
	{
		processingqueue = true;
		//console.debug("Queue event processing; queue size? " + eventQueue.length);

		currentEvent = eventQueue.shift();
		//console.log("Waiting to Process Event");
		while(currentEvent !== undefined)
		{
			await ProcessEvent(currentEvent, transmitted_events);
			//console.log("Queue event processing check; queue size? " + eventQueue.length);
			currentEvent = eventQueue.shift();
		}

		processingqueue = false;
	}
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Turn the eventdata received by PrUN into a form stored and readable by PMMG
// result: Dictionary with the key "PMMG-User-Info" that contains all the user's stored game data info
// eventdata: The message sent from the server containing updated game data info
function logEvent(result, eventdata)
{
	console.log(eventdata.messageType);
	// Reset it every time for testing
	//result["PMMG-User-Info"] = {};
	
	// Initialize it if not initialized
	if(!result["PMMG-User-Info"]){result["PMMG-User-Info"] = {};}
	
	if(!result["PMMG-User-Info"]["sites"]){result["PMMG-User-Info"]["sites"] = [];}
	if(!result["PMMG-User-Info"]["storage"]){result["PMMG-User-Info"]["storage"] = [];}
	if(!result["PMMG-User-Info"]["workforce"]){result["PMMG-User-Info"]["workforce"] = [];}
	if(!result["PMMG-User-Info"]["contracts"]){result["PMMG-User-Info"]["contracts"] = [];}
	if(!result["PMMG-User-Info"]["production"]){result["PMMG-User-Info"]["production"] = [];}
	if(!result["PMMG-User-Info"]["currency"]){result["PMMG-User-Info"]["currency"] = [];}
	if(!result["PMMG-User-Info"]["cxos"]){result["PMMG-User-Info"]["cxos"] = [];}
	if(!result["PMMG-User-Info"]["fxos"]){result["PMMG-User-Info"]["fxos"] = [];}
	
	switch(eventdata.messageType)
	{
		case "SITE_SITES":
			result["PMMG-User-Info"]["sites"] = result["PMMG-User-Info"]["sites"].filter(item => item.type !== "BASE");
			
			eventdata["payload"]["sites"].forEach(site => {
				const planetId = site["address"]["lines"][1]["entity"]["naturalId"];
				const planetName = site["address"]["lines"][1]["entity"]["name"];
				
				const siteData = {"PlanetName": planetName, "PlanetNaturalId": planetId, "siteId": site["siteId"], "buildings": [], "type": "BASE"};
				
				site["platforms"].forEach(building => {
					const buildingTicker = building["module"]["reactorTicker"];
					
					const lastRepair = building["lastRepair"] ? building["lastRepair"]["timestamp"] : building["creationTime"]["timestamp"];
					
					siteData["buildings"].push({"buildingTicker": buildingTicker, "lastRepair": lastRepair, "condition": building["condition"], "reclaimableMaterials": building["reclaimableMaterials"], "repairMaterials": building["repairMaterials"]});
				});
				
				result["PMMG-User-Info"]["sites"].push(siteData);
			});
			break;
		case "STORAGE_STORAGES":
			//console.log(eventdata.payload.stores);
			eventdata["payload"]["stores"].forEach(store => {
				const duplicateStoreIndex = result["PMMG-User-Info"]["storage"].findIndex(item => item.id === store["id"]);
				
				const givenItems = store["items"];
				store["items"] = [];
				givenItems.forEach(item => {
					if(item.quantity && item.quantity.material)
					{
						store["items"].push({"weight": item["weight"], "volume": item["volume"], "MaterialTicker": item["quantity"]["material"]["ticker"], "Amount": item["quantity"]["amount"]});
					}
				});
				
				if(duplicateStoreIndex != -1)
				{
					result["PMMG-User-Info"]["storage"][duplicateStoreIndex] = store;
				}
				else
				{
					result["PMMG-User-Info"]["storage"].push(store);
				}
			});
			break;
		case "STORAGE_CHANGE":
			
			eventdata.payload.stores.forEach(store => {
				const matchingStore = result["PMMG-User-Info"]["sites"].find(item => item.siteId === store["addressableId"]);
				
				const index = result["PMMG-User-Info"]["storage"].findIndex(item => item.addressableId === store.addressableId);
				
				if(matchingStore)
				{
					store["PlanetNaturalId"] = matchingStore["PlanetNaturalId"];
					store["PlanetName"] = matchingStore["PlanetName"];
					const givenItems = store["items"];
					store["items"] = [];
					givenItems.forEach(item => {
						if(item.quantity && item.quantity.material)
						{
							store["items"].push({"weight": item["weight"], "volume": item["volume"], "MaterialTicker": item["quantity"]["material"]["ticker"], "Amount": item["quantity"]["amount"]});
						}
						else
						{
							//console.log(item); // Debug line. Some items seem to not have a quantity. This should help figure out what those are.
						}
					});
					
					if(index != -1)
					{
						result["PMMG-User-Info"]["storage"][index] = store;
					}
					else
					{
						result["PMMG-User-Info"]["storage"].push(store);
					}
				}
				else if(store["name"])	// Ship store
				{
					const matchingShipStoreIndex = result["PMMG-User-Info"]["storage"].findIndex(item => item.addressableId === store["addressableId"]);
					
					const givenItems = store["items"];
					store["items"] = [];
					givenItems.forEach(item => {
						if(item.quantity && item.quantity.material)
						{
							store["items"].push({"weight": item["weight"], "volume": item["volume"], "MaterialTicker": item["quantity"]["material"]["ticker"], "Amount": item["quantity"]["amount"]});
						}
						else
						{
							//console.log(item); // Debug line. Some items seem to not have a quantity. This should help figure out what those are.
						}
					});
					
					if(matchingShipStoreIndex != -1)
					{
						result["PMMG-User-Info"]["storage"][matchingShipStoreIndex] = store;
					}
					else
					{
						result["PMMG-User-Info"]["storage"].push(store);
					}
				}
			});
			break;
		case "WAREHOUSE_STORAGES":
			result["PMMG-User-Info"]["sites"] = result["PMMG-User-Info"]["sites"].filter(item => item.type !== "WAREHOUSE");
			
			eventdata["payload"]["storages"].forEach(warehouse => {
				const planetId = warehouse["address"]["lines"][1]["entity"]["naturalId"];
				const planetName = warehouse["address"]["lines"][1]["entity"]["name"];
				
				const siteData = {"PlanetNaturalId": planetId, "PlanetName": planetName, "type": "WAREHOUSE", "units": warehouse["units"], "siteId": warehouse["warehouseId"]};
				
				result["PMMG-User-Info"]["sites"].push(siteData);
			});
			break;
		case "WORKFORCE_WORKFORCES":
			var matchIndex = result["PMMG-User-Info"]["workforce"].findIndex(item => item.siteId === eventdata["payload"]["siteId"]);
			const planetId = eventdata["payload"]["address"]["lines"][1]["entity"]["naturalId"];
			const planetName = eventdata["payload"]["address"]["lines"][1]["entity"]["name"];
			
			
			const workforceArray = {"PlanetName": planetName, "PlanetNaturalId": planetId, "workforce": eventdata["payload"]["workforces"], "siteId": eventdata["payload"]["siteId"]};
			
			if(matchIndex != -1)
			{
				result["PMMG-User-Info"]["workforce"][matchIndex] = workforceArray;
			}
			else
			{
				result["PMMG-User-Info"]["workforce"].push(workforceArray);
			}
			
			break;
		case "CONTRACTS_CONTRACTS":
			const badParams = ["id", "canExtend", "canRequestTermination", "extensionDeadline", "terminationReceived", "terminationSent"]
			eventdata["payload"]["contracts"].forEach(contract => {
				badParams.forEach(param => {
					delete contract[param];
				});
				contract["conditions"].forEach(condition => {
					delete condition["id"];
				});
			});
			
			result["PMMG-User-Info"]["contracts"] = eventdata["payload"]["contracts"];
			break;
		case "CONTRACTS_CONTRACT":
			const badKeys = ["id", "canExtend", "canRequestTermination", "extensionDeadline", "terminationReceived", "terminationSent"];
			const matchingContract = result["PMMG-User-Info"]["contracts"].find(obj => obj.localId === eventdata["payload"]["localId"]);
			if(matchingContract)	// Copy new object into old
			{
				const oldKeys = Object.keys(matchingContract);
				oldKeys.forEach(key => {
					delete matchingContract[key];
				});
				const newKeys = Object.keys(eventdata["payload"]);
				newKeys.forEach(key => {
					if(!badKeys.includes(key))
					{
						matchingContract[key] = eventdata["payload"][key];
					}
				});
			}
			else	// Otherwise push it in its entirety. Doesn't get rid of uneccessary params, but that's fine. They'll be wiped on the next full reload.
			{
				result["PMMG-User-Info"]["contracts"].push(eventdata["payload"]);
			}
			break;
		case "PRODUCTION_SITE_PRODUCTION_LINES":
			//console.log(eventdata["payload"]);
			matchIndex = result["PMMG-User-Info"]["production"].findIndex(item => item.siteId === eventdata["payload"]["siteId"]);
			
			const siteInfo = {"lines": [], "siteId": eventdata["payload"]["siteId"]};
			eventdata["payload"]["productionLines"].forEach(line => {
				const planetId = line["address"]["lines"][1]["entity"]["naturalId"];
				const planetName = line["address"]["lines"][1]["entity"]["name"];
				
				const prodLine = {"PlanetName": planetName, "PlanetNaturalId": planetId, "capacity": line["capacity"], "condition": line["condition"], "efficiency": line["efficiency"], "efficiencyFactors": line["efficiencyFactors"], "type": line["type"], "orders": []};
				
				line["orders"].forEach(order => {
					const orderInfo = {};
					orderInfo.completed = order.completed;
					orderInfo.started = order.started ? order.started.timestamp : order.started;
					orderInfo.duration = order.duration ? order.duration.millis : Infinity;	// Did this null value kill stuff down the line?
					orderInfo.halted = order.halted;
					orderInfo.productionFee = order.productionFee;
					orderInfo.recurring = order.recurring;
					
					orderInfo.inputs = [];
					order.inputs.forEach(input => {
						orderInfo.inputs.push({"MaterialTicker": input.material.ticker, "Amount": input.amount});
					});
					
					orderInfo.outputs = [];
					order.outputs.forEach(input => {
						orderInfo.outputs.push({"MaterialTicker": input.material.ticker, "Amount": input.amount});
					});
					
					prodLine.orders.push(orderInfo);
				});
				
				siteInfo.lines.push(prodLine);
				
			});
			
			if(siteInfo.lines[0])
			{
				siteInfo.PlanetName = siteInfo.lines[0].PlanetName;
				siteInfo.PlanetNaturalId = siteInfo.lines[0].PlanetNaturalId;
			}
			
			if(matchIndex != -1)
			{
				result["PMMG-User-Info"]["production"][matchIndex] = siteInfo;
			}
			else
			{
				result["PMMG-User-Info"]["production"].push(siteInfo);
			}
			break;
		case "COMPANY_DATA":	// Currency
			result["PMMG-User-Info"]["currency"] = [];
			
			eventdata.payload.currencyAccounts.forEach(account => {
				result["PMMG-User-Info"]["currency"].push(account.currencyBalance);
			});
			
			result["PMMG-User-Info"]["company-name"] = "";
			
			if(eventdata.payload.name)
			{
				result["PMMG-User-Info"]["company-name"] = eventdata.payload.name;
			}
			break;
		case "FOREX_TRADER_ORDERS":	// FX Orders
			result["PMMG-User-Info"]["fxos"] = eventdata.payload.orders;
			break;
		case "COMEX_TRADER_ORDERS":	// CX Orders
			result["PMMG-User-Info"]["cxos"] = eventdata.payload.orders;
			break;
	}
	
	console.log(result);
	//console.log("Finished Logging Event, now Setting...");
	setSettings(result);
}


// UTIL FUNCTIONS, REMOVE WHEN INTEGRATED INTO PMMG
// Set the data in local storage. Pass it the result of a getLocalStorage call
function setSettings(result)
{
	//console.log("Trying to Set Data");
	try
	{
		browser.storage.local.set(result).then(function(){});	// For FireFox, throws an error in Chrome
	}
	catch(err)
	{
		chrome.storage.local.set(result, function(){	// For Chrome, doesn't work in FireFox
			//console.log("PMMG: Configuration Saved.");
		});
	}
	return;
}

// Get the data in local storage for a given storageName. Then call the callback function.
// Also pass the params through to the callback function
function getLocalStorage(storageName, callbackFunction, params)
{
	//console.log("Trying to Get Data");
	try
	{
		browser.storage.local.get(storageName).then(function(result) {
			//console.log("Successfully Got Data");
			callbackFunction(result, params)
		});	// For FireFox, throws an error in Chrome
	} catch(err)
	{
		chrome.storage.local.get([storageName], function(result)	// For Chrome, doesn't work in FireFox
		{
			callbackFunction(result, params);
		});
	}
}

// Find the data corresponding to a planet in an array of FIO inventory/burn data
function findCorrespondingPlanetIndex(planet, data)
{
	if(!data || !planet){return undefined;}
	for(var i = 0; i < data.length; i++)
	{
		if(planet && data[i]["PlanetNaturalId"] && data[i]["PlanetNaturalId"].toLowerCase() == planet.toLowerCase())	// If the natural ID matches: XX-000x
		{
			return i;
		}
		else if(planet && data[i]["PlanetName"] && data[i]["PlanetName"].toLowerCase() == planet.toLowerCase())	// If the planet name matches
		{
			return i;
		}
	}
	return undefined;
}