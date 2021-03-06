const boardModels = {
	1: "Boosted Dual",
	2: "Boosted Dual+",
	3: "Boosted Plus",
	4: "Boosted Stealth",
	5: "Boosted Mini S",
	6: "Boosted Mini X",
	7: "Boosted Rev"
};

const rideModes = {
	0: "Beginner",
	1: "Eco",
	2: "Expert",
	3: "Pro",
	4: "Hyper"
};

const batteryModels = {
	0: "UNKNOWN 0",
	1: "B2SR",
	2: "B2XR"
};

const valueElementIDs = [
	"status",
	"md-model",
	"md-firmware-version",
	"md-serial-number",
	"md-odo",
	"md-ride-modes",
	"md-current-ride-mode",
	"md-beams-supported",
	"battery-model",
	"battery-serial-number",
	"battery-firmware-version",
	"battery-soc"
];

function render(data) {
	for (let i = 0; i < valueElementIDs.length; i++) {
		document.getElementById(valueElementIDs[i]).textContent = data[valueElementIDs[i]] || document.getElementById(valueElementIDs[i]).textContent;
	}
}

function clearView(data) {
	for (let i = 0; i < valueElementIDs.length; i++) {
		document.getElementById(valueElementIDs[i]).textContent = "";
	}
}

let serviceCache = {};
let characteristicCache = {};

const textDecoder = new TextDecoder("utf-8");

async function getService(server, uuid) {
	if (serviceCache[uuid]) {
		return serviceCache[uuid];
	}

	serviceCache[uuid] = await server.getPrimaryService(uuid);
	return serviceCache[uuid];
}

async function getCharacteristicValue(service, uuid) {
	if (characteristicCache[uuid]) {
		return characteristicCache[uuid].readValue();
	}

	characteristicCache[uuid] = await service.getCharacteristic(uuid);
	return await characteristicCache[uuid].readValue();
}

async function readDeviceInfoData(server) {
	let data = {};

	const deviceInfoService = await getService(server, "0000180a-0000-1000-8000-00805f9b34fb");
	const mdFirmwareValue = await getCharacteristicValue(deviceInfoService, "00002a26-0000-1000-8000-00805f9b34fb");

	const mdFirmware = textDecoder.decode(mdFirmwareValue);

	if (mdFirmware === "v2.7.2") {
		document.getElementById("md-firmware-version").className = "value green";
		data["md-firmware-version"] = mdFirmware + " (latest version)";
	} else {
		data["md-firmware-version"] = mdFirmware;
	}

	return data;
}

async function readMDData(server) {
	let data = {};

	const mdService = await getService(server, "7dc55a86-c61f-11e5-9912-ba0be0483c18");
	const mdModelValue = await getCharacteristicValue(mdService, "7dc59643-c61f-11e5-9912-ba0be0483c18");
	const mdIDValue = await getCharacteristicValue(mdService, "7dc5bb39-c61f-11e5-9912-ba0be0483c18");
	const mdOdoValue = await getCharacteristicValue(mdService, "7dc56594-c61f-11e5-9912-ba0be0483c18");
	const mdRideModesValue = await getCharacteristicValue(mdService, "7dc55dec-c61f-11e5-9912-ba0be0483c18");
	const mdCurrentRideModeValue = await getCharacteristicValue(mdService, "7dc55f22-c61f-11e5-9912-ba0be0483c18");

	const mdID = textDecoder.decode(mdIDValue);
	data["md-serial-number"] = mdID.substring(mdID.length - 9, mdID.length);

	const model = mdModelValue.getUint8(0);
	data["md-model"] = boardModels[model];

	let miles = 0;
	if (model === 4 || model === 5) {
		miles = mdOdoValue.getUint32(0, true) * 3.6128E-5;
	} else if (model === 7) {
		miles = mdOdoValue.getUint32(0, true) * 6.2137273665E-4;
	} else {
		miles = mdOdoValue.getUint32(0, true) * 3.8386E-5;
	}

	data["md-odo"] = miles.toFixed(2) + " miles | " + (miles * 1.60934).toFixed(2) + " km";

	data["md-ride-modes"] = "";
	for (let i = 0; i < mdRideModesValue.getUint8(0); i++) {
		data["md-ride-modes"] += rideModes[i] + " ";
	}

	data["md-current-ride-mode"] = rideModes[mdCurrentRideModeValue.getUint8(0)];

	return data;
}

async function readBeamsSupportData(server) {
	try {
		await getService(server, "ea32b817-d410-42e2-848a-1218201468fc");

		return {"md-beams-supported": "Yes"};
	} catch(e) {
		return {"md-beams-supported": "No"};
	}
}

async function readBatteryData(server) {
	let data = {};

	const batteryService = await getService(server, "65a8eaa8-c61f-11e5-9912-ba0be0483c18");
	const batterySerialValue = await getCharacteristicValue(batteryService, "65a8f834-c61f-11e5-9912-ba0be0483c18");
	const batteryFirmwareValue = await getCharacteristicValue(batteryService, "65a8f833-c61f-11e5-9912-ba0be0483c18");
	const batterySOCValue = await getCharacteristicValue(batteryService, "65a8eeae-c61f-11e5-9912-ba0be0483c18");

	data["battery-model"] = batteryModels[batteryFirmwareValue.getUint8(0)];
	
	const batterySerial = batterySerialValue.getUint32(0, true);
	data["battery-serial-number"] = batterySerial.toString("16").toUpperCase();

	const batteryFirmware = "v" + batteryFirmwareValue.getUint8(0) + "." + batteryFirmwareValue.getUint8(1) + "." + batteryFirmwareValue.getUint8(2);
	if (batteryFirmware === "v2.5.1" || batteryFirmware === "v1.6.3") {
		document.getElementById("battery-firmware-version").className = "value green";
		data["battery-firmware-version"] = batteryFirmware + " (latest version)";
	} else {
		document.getElementById("battery-firmware-version").className = "value yellow";
		data["battery-firmware-version"] = batteryFirmware + " (old version)";
	}

	data["battery-soc"] = batterySOCValue.getUint8(0) + "%";

	return data;
}

async function onDisconnect() {
	render({status: "Disconnected"});
}

async function onButtonClick() {
	if (!navigator.bluetooth) {
		render({status: "This device does not support Web Bluetooth"});
		return;
	}

	render({status: "Waiting for device selection"});

	let device;

	try {
		device = await navigator.bluetooth.requestDevice({
			filters: [
				{
					services: ["7dc55a86-c61f-11e5-9912-ba0be0483c18"]
				}
			],
			optionalServices: [
				BluetoothUUID.getService("0000180a-0000-1000-8000-00805f9b34fb"),
				BluetoothUUID.getService("7dc55a86-c61f-11e5-9912-ba0be0483c18"),
				BluetoothUUID.getService("65a8eaa8-c61f-11e5-9912-ba0be0483c18"),
				BluetoothUUID.getService("ea32b817-d410-42e2-848a-1218201468fc")
			]
		});
	} catch(error) {
		render({status: "Disconnected"});
		return;
	}

	device.addEventListener("gattserverdisconnected", onDisconnect);
	render({status: "Connecting to device..."});

	let server;
	let retries = 0;

	while (retries < 3) {
		try {
			server = await device.gatt.connect();
			await server.getPrimaryServices();

			render({status: "Reading data..."});

			serviceCache = {};
			characteristicCache = {};

			const deviceInfo = await readDeviceInfoData(server);
			const mdInfo = await readMDData(server);
			const beamsSupportInfo = await readBeamsSupportData(server);
			const batteryInfo = await readBatteryData(server);

			render({
				status: "Connected to " + device.name,
				...deviceInfo,
				...mdInfo,
				...beamsSupportInfo,
				...batteryInfo
			});

			break;
		} catch(error) {
			console.log("Error: " + error);
			console.log("Retrying...");
			retries++;
		}
	}
}