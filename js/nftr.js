let tileWidth, tileHeight, tileSize, fontTiles, fontWidths, fontMap, questionMark = -1;
let maxChar = 0;
let palette = [[0, 0, 0, 0], [0x28, 0x28, 0x28, 0xFF], [0x90, 0x90, 0x90, 0xFF], [0xD7, 0xD7, 0xD7, 0xFF]];
let paletteHTML = ["", "#282828", "#909090", "#D7D7D7"];
let data, fontU8, fileName;
let brushColor = 0, realColor = 0;

var onkeydown, onkeyup;

function loadFont(file) {
	if(!file) {
		alert("No file selected!");
		$("#saveButton").collapse("hide");
		$("#editBox").collapse("hide");
		window.onbeforeunload = function() { return; };
		return false;
	}
	fileName = file.name;

	let reader = new FileReader();
	reader.readAsArrayBuffer(file);

	reader.onload = function() { reloadFont(this.result); };
}

function reloadFont(buffer) {
	fontU8 = new Uint8Array(buffer);
	data = new DataView(fontU8.buffer);
	let offset = 0x14;

	// Skip font info
	offset += data.getUint8(0x14);

	// Load glyph info
	let chunkSize = data.getUint32(offset, true);
	offset += 4;
	tileWidth = data.getUint8(offset++);
	tileHeight = data.getUint8(offset++);
	tileSize = data.getUint16(offset, true);
	offset += 2;

	// Load character glyphs
	let tileAmount = ((chunkSize - 0x10) / tileSize);
	offset += 4;
	fontTiles = [];
	for(let i = 0; i < tileAmount; i++) {
		fontTiles.push(new Uint8Array(buffer.slice(offset + (i * tileSize), offset + ((i + 1) * tileSize))));
	}

	// Fix top row
	// TODO: Maybe don't do this? Look into what these mean
	// for(let i = 0; i < tileAmount; i++) {
	// 	fontTiles[i * tileSize]     = 0;
	// 	fontTiles[i * tileSize + 1] = 0;
	// 	fontTiles[i * tileSize + 2] = 0;
	// }

	// Load character widths
	offset = data.getUint32(0x24, true) - 4;
	chunkSize = data.getUint32(offset, true);
	offset += 4 + 2;
	let charCount = data.getUint16(offset, true) + 1;
	maxChar = charCount;
	offset += 2 + 4;
	fontWidths = [];
	for(let i = 0; i < tileAmount; i++) {
		fontWidths.push(new Uint8Array(buffer.slice(offset + (i * 3), offset + ((i + 1) * 3))));
	}

	// Load character maps
	fontMap = new Uint16Array(charCount);
	let locPAMC = data.getUint32(0x28, true);

	while(locPAMC < fontU8.length && locPAMC != 0) {
		offset = locPAMC;
		let firstChar = data.getUint16(offset, true);
		offset += 2;
		let lastChar = data.getUint16(offset, true);
		offset += 2;
		let mapType = data.getUint32(offset, true);
		offset += 4;
		locPAMC = data.getUint32(offset, true);
		offset += 4;

		switch(mapType) {
			case 0: {
				let firstTile = data.getUint16(offset, true);
				for(let i = firstChar; i <= lastChar; i++) {
					fontMap[firstTile+(i-firstChar)] = i;
				}
				break;
			} case 1: {
				for(let i = firstChar; i<= lastChar; i++) {
					let tile = data.getUint16(offset, true);
					offset += 2;
					fontMap[tile] = i;
				}
				break;
			} case 2: {
				let groupAmount = data.getUint16(offset, true);
				offset += 2;
				for(let i = 0; i < groupAmount; i++) {
					let charNo = data.getInt16(offset, true);
					offset += 2;
					let tileNo = data.getInt16(offset, true);
					offset += 2;
					fontMap[tileNo] = charNo;
				}
				break;
			}
		}
	}
	// Uncomment to log letters in the font map
	// let letters = "";
	// for(let char of fontMap) {
	// 	letters += String.fromCharCode(char);
	// }
	// console.log(letters);
	document.getElementById("input").style.fontSize = tileWidth + "px";
	updateBrush(-1);
	for(let i = 0; i < 4; i++) {
		updatePalette(i);
	}
	$("#saveButton").collapse("show");
	$("#editBox").collapse("show");
	window.onbeforeunload = function() { return "Are you sure you want to leave? Unsaved data will be lost!"; };

	questionMark = getCharIndex("?");
	updateBitmap();
}

function saveFont() {
	// Copy glyphs back in
	let offset = data.getUint32(0x20, true) + 8;
	for(let i = 0; i < fontTiles.length; i++) {
		fontU8.set(fontTiles[i], offset + (i * fontTiles[0].length));
	}

	// Copy widths back in
	offset = data.getUint32(0x24, true) + 8;
	for(let i = 0; i < fontWidths.length; i++) {
		fontU8.set(fontWidths[i], offset + (i * 3));
	}

	// Download the file
	let blob = new Blob([fontU8], {type: "application/octet-stream"});
	let a = document.createElement('a');
	let url = window.URL.createObjectURL(blob);
	a.href = url;
	a.download = fileName;
	a.click();
	window.URL.revokeObjectURL(url);
}

function getCharIndex(c) {
	let char = typeof(c) == "string" ? c.charCodeAt(0) : c;
	// Try a binary search
	let left = 0;
	let right = fontMap.length;

	while(left <= right) {
		let mid = left + ((right - left) / 2);
		if(fontMap[mid] == char) {
			return mid;
		}

		if(fontMap[mid] < c) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	// If that doesn't find the char, do a linear search
	for(let i in fontMap) {
		if(fontMap[i] == char)	return i;
	}
	return questionMark;
}

function updateBitmap() {
	let str = document.getElementById("input").value;
	let canvas = document.getElementById("canvas");
	let ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	let x = 0, y = 0;
	for(let c of str) {
		if(c == '\n') {
			y += tileHeight;
			x = 0;
			continue;
		}
		let imgData = ctx.createImageData(tileWidth, tileHeight);

		let t = getCharIndex(c);
		let charImg = new Array(tileHeight * tileWidth);
		for(let i = 0; i < tileSize; i++) {
			charImg[(i * 4)]     = (fontTiles[t][i] >> 6 & 3);
			charImg[(i * 4) + 1] = (fontTiles[t][i] >> 4 & 3);
			charImg[(i * 4) + 2] = (fontTiles[t][i] >> 2 & 3);
			charImg[(i * 4) + 3] = (fontTiles[t][i]      & 3);
		}

		for(let i = 0; i < imgData.data.length / 4; i++) {
			imgData.data[i * 4]     = palette[charImg[i]][0];
			imgData.data[i * 4 + 1] = palette[charImg[i]][1];
			imgData.data[i * 4 + 2] = palette[charImg[i]][2];
			imgData.data[i * 4 + 3] = palette[charImg[i]][3];
		}

		if(x + fontWidths[t][2] > canvas.width) {
			y += tileHeight;
			x = 0;
		}
		ctx.putImageData(imgData, x + fontWidths[t][0], y);
		x += fontWidths[t][2];
	}
}

function updatePalette(i) {
	let color = document.getElementById("palette" + i).value;
	if(color.toUpperCase() == "#FF00FF") {
		palette[i] = [0, 0, 0, 0];
		paletteHTML[i] = "";
	} else {
		let r = parseInt(color.substr(1, 2), 16);
		let g = parseInt(color.substr(3, 2), 16);
		let b = parseInt(color.substr(5, 2), 16);
		palette[i] = [r, g, b, 0xFF];
		paletteHTML[i] = color;
	}

	if(paletteHTML[i] == "") {
		document.getElementById("palette" + i).style.backgroundColor = "gray";
		document.getElementById("palette" + i).style.backgroundImage = "repeating-linear-gradient(135deg, transparent, transparent 5px, rgba(255,255,255,.5) 5px, rgba(255,255,255,.5) 10px)";
	} else {
		document.getElementById("palette" + i).style.backgroundColor =  paletteHTML[i];
		document.getElementById("palette" + i).style.backgroundImage = "";
	}

	updateBitmap();
	updateBrush(-1);
	updateLetterPalette();
}

function clearPalette(i) {
	document.getElementById("palette" + i).value = "#FF00FF";
	updatePalette(i);
}

function loadLetter() {
	let char = document.getElementById("letterInput").value;
	let t = getCharIndex(char);
	if(t == questionMark && char[0] != "?") {
		document.getElementById("letter").innerHTML = "";
		document.getElementById("left").value = 0;
		document.getElementById("bitmapWidth").value = 0;
		document.getElementById("totalWidth").value = 0;
		return;
	}
	let charImg = new Array(tileHeight * tileWidth);
	for(let i = 0; i < tileSize; i++) {
		charImg[(i * 4)]     = (fontTiles[t][i] >> 6 & 3);
		charImg[(i * 4) + 1] = (fontTiles[t][i] >> 4 & 3);
		charImg[(i * 4) + 2] = (fontTiles[t][i] >> 2 & 3);
		charImg[(i * 4) + 3] = (fontTiles[t][i]      & 3);
	}

	document.getElementById("letter").innerHTML = "";

	let row;
	for(let y = 0; y < tileHeight; y++) {
		row = document.createElement("tr");
		for(let x = 0; x < tileWidth; x++) {
			let item = document.createElement("td");
			item.id = "pixel" + ((y * tileWidth) + x);
			item.classList = charImg[(y * tileWidth) + x];
			item.style.backgroundColor = paletteHTML[charImg[(y * tileWidth) + x]];
			item.onmousedown = function() { drawLetter((y * tileWidth) + x); };
			item.onmouseover = function() { drawLetter((y * tileWidth) + x); };
			if(x == (fontWidths[t][2] - fontWidths[t][0])) {
				item.style.borderLeft = "1px solid red";
			} else if(x == fontWidths[t][1]) {
				item.style.borderLeft = "1px solid blue";
			}
			row.appendChild(item);
		}
		document.getElementById("letter").appendChild(row);
	}

	// If the last column is colored, apply it to the table itself
	if((fontWidths[t][2] - fontWidths[t][0]) == tileWidth) {
		document.getElementById("letter").style.borderRight = "1px solid red";
	} else if(fontWidths[t][1] == tileWidth) {
		document.getElementById("letter").style.borderRight = "1px solid blue";
	} else {
		document.getElementById("letter").style.borderRight = "";
	}

	document.getElementById("left").value = fontWidths[t][0];
	document.getElementById("left").max = tileWidth;
	document.getElementById("bitmapWidth").value = fontWidths[t][1];
	document.getElementById("bitmapWidth").max = tileWidth;
	document.getElementById("totalWidth").value = fontWidths[t][2];
	document.getElementById("totalWidth").max = tileWidth;
}

function updateWidths() {
	let t = getCharIndex(document.getElementById("letterInput").value);
	for(let i = 0; i < tileWidth * tileHeight; i++) {
		if((i % tileWidth) == (document.getElementById("totalWidth").value - document.getElementById("left").value)) {
			document.getElementById("pixel" + i).style.borderLeft = "1px solid red";
		} else if((i % tileWidth) == document.getElementById("bitmapWidth").value) {
			document.getElementById("pixel" + i).style.borderLeft = "1px solid blue";
		} else {
			document.getElementById("pixel" + i).style.borderLeft = "";
		}
	}

	// If the last column is colored, apply it to the table itself
	if((document.getElementById("totalWidth").value - document.getElementById("left").value) == tileWidth) {
		document.getElementById("letter").style.borderRight = "1px solid red";
	} else if(document.getElementById("bitmapWidth").value == tileWidth) {
		document.getElementById("letter").style.borderRight = "1px solid blue";
	} else {
		document.getElementById("letter").style.borderRight = "";
	}
}

function keyListener(on) {
	if(on) {
		onkeydown = function(e) {
			if(e.key == "Shift") {
				realColor = brushColor;
				updateBrush(0);
			} else if(e.key >= 1 && e.key <= 4) {
				updateBrush(event.key - 1);
				realColor = brushColor;
			}
		}

		onkeyup = function(e) {
			if(e.key == "Shift") {
				brushColor = realColor;
				updateBrush(brushColor);
			}
		}
	} else {
		onkeydown = function() {};
		onkeyup = function() {};
	}
}

function updateBrush(color) {
	if(color > -1)
		brushColor = color;

	for(let i = 0; i < 4; i++) {
		document.getElementById("brushColor" + i).style.borderColor = paletteHTML[i] ? paletteHTML[i] : "gray";
		if(i == brushColor) {
			if(paletteHTML[i] == "") {
				document.getElementById("brushColor" + i).style.backgroundColor = "gray";
				document.getElementById("brushColor" + i).style.backgroundImage = "repeating-linear-gradient(135deg, transparent, transparent 5px, rgba(255,255,255,.5) 5px, rgba(255,255,255,.5) 10px)";
			} else {
				document.getElementById("brushColor" + i).style.backgroundColor =  paletteHTML[i];
				document.getElementById("brushColor" + i).style.backgroundImage = "";
			}
		} else {
			document.getElementById("brushColor" + i).style.backgroundColor = "";
			document.getElementById("brushColor" + i).style.backgroundImage = "";
		}
	}
}

function drawLetter(i) {
	let color = brushColor;
	if(event.shiftKey) {
		color = 0;
	}
	if(event.buttons) {
		document.getElementById("pixel" + i).style.backgroundColor = paletteHTML[color];
		document.getElementById("pixel" + i).classList = color;
	}
}

function updateLetterPalette() {
	if(document.getElementById("letter").hasChildNodes()) {
		for(let i = 0; i < tileWidth * tileHeight; i++) {
			let color = document.getElementById("pixel" + i).classList[0];
			document.getElementById("pixel" + i).style.backgroundColor = paletteHTML[color];
		}
	}
}

function saveLetter() {
	let char = document.getElementById("letterInput").value;
	let t = getCharIndex(char);

	if(t == questionMark && char[0] != "?")	return;

	for(let i = 0; i < tileWidth * tileHeight; i += 4) {
		let byte = 0;
		if(document.getElementById("pixel" + i))
			byte |= (document.getElementById("pixel" + i).classList[0]) << 6;
		if(document.getElementById("pixel" + (i + 1)))
			byte |= (document.getElementById("pixel" + (i + 1)).classList[0] & 3) << 4;
		if(document.getElementById("pixel" + (i + 2)))
			byte |= (document.getElementById("pixel" + (i + 2)).classList[0] & 3) << 2;
		if(document.getElementById("pixel" + (i + 3)))
			byte |= (document.getElementById("pixel" + (i + 3)).classList[0] & 3) << 0;

		fontTiles[t][i / 4] = byte;
	}

	fontWidths[t][0] = document.getElementById("left").value;
	fontWidths[t][1] = document.getElementById("bitmapWidth").value;
	fontWidths[t][2] = document.getElementById("totalWidth").value;

	updateBitmap();
}

function amountToIncrease(increaseAmount, tiles, widths) {
	let out = 0;

	if(tiles) {
		out += increaseAmount * tileSize;
		while(out % 4)	out++;
	}

	if(widths) {
		out += increaseAmount * 3;
		while(out % 4)	out++;
	}

	return out;
}

function addCharacters() {
	let str = prompt("Enter the characters you want to add: ");
	if(str == null)	return;
	str = Array.from(str).sort().join("");
	let chars = "";
	for(let i in str) {
		if(str[i] != str[i-1]
		&& getCharIndex(str[i]) == questionMark
		&& (str[i] != "?" || questionMark == -1)
		&& str.charCodeAt(i) <= 0xFFFF
		&& str.charAt(i) != '\n') {
			chars += str[i];
		}
	}

	let length = fontU8.length + amountToIncrease(chars.length, true, true);

	let newFile = new Uint8Array(length);
	let newData = new DataView(newFile.buffer);

	let offset = 0x14;
	offset += data.getUint32(offset, true);

	// Increase chunk size
	data.setUint32(offset, data.getUint32(offset, true) + amountToIncrease(chars.length, true, false), true);

	// Copy through glyphs
	let locHDWC = data.getUint32(0x24, true);
	newFile.set(fontU8.subarray(0, locHDWC - 8), 0);
	let newLocHDWC = locHDWC + amountToIncrease(chars.length, true, false);

	// Increase chunk size
	data.setUint32(locHDWC - 4, data.getUint32(locHDWC - 4, true) + amountToIncrease(chars.length, false, true), true);

	// Increase HDWC offset
	newData.setUint32(0x24, newLocHDWC, true);

	// Copy widths
	let locPAMC = data.getUint32(0x28, true)
	newFile.set(fontU8.subarray(locHDWC - 8, locPAMC - 8), newLocHDWC - 8);
	let newLocPAMC = locPAMC + amountToIncrease(chars.length, true, true);

	// Increase max character
	newData.setUint16(newLocHDWC + 2, newData.getUint16(newLocHDWC + 2, true) + chars.length, true);

	// Increase PAMC offset
	newData.setUint32(0x28, newLocPAMC, true);

	// Copy the rest of the file
	newFile.set(fontU8.subarray(locPAMC - 8, fontU8.length), newLocPAMC - 8);


	// Increase character maps offsets
	while(newLocPAMC <= newFile.length && newData.getUint32(newLocPAMC + 8, true) != 0) {
		newData.setUint32(newLocPAMC + 8, newData.getUint32(newLocPAMC + 8, true) + amountToIncrease(chars.length, true, true), true);
		newLocPAMC = newData.getUint32(newLocPAMC + 8, true);
	}

	// Write new size to header
	newData.setUint32(8, newFile.length, true);

	// Set back to main font buffer
	fontU8 = newFile;

	// Reload for added bitmaps and widths
	reloadFont(fontU8.buffer);

	// Add new characters to the end of the map
	for(let i = 0; i < chars.length; i++) {
		fontMap[fontMap.length - chars.length + i] = chars.charCodeAt(i);
	};

	// Regenerate the maps
	regenMaps();
}

function amountToDecrease(decreaseAmount, tiles, widths) {
	let out = 0;

	if(tiles) {
		out += decreaseAmount * tileSize;
		while(out % 4)	out++;
	}

	if(widths) {
		out += decreaseAmount * 3;
		while(out % 4)	out++;
	}

	return out;
}

function removeCharacters() {
	let str = prompt("Enter the characters you want to remove: ");
	if(str == null)	return;
	str = Array.from(str).sort().join("");
	let chars = [], indexes = [];
	for(let i in str) {
		if(str[i] != str[i - 1]
		&& (getCharIndex(str[i]) != questionMark || str[i] == "?")
		&& str.charCodeAt(i) <= 0xFFFF
		&& str.charAt(i) != '\n') {
			chars.push(str.charCodeAt(i));
			indexes.push(fontMap.findIndex(r => r == str.charCodeAt(i)));
		}
	}

	let length = fontU8.length - amountToDecrease(chars.length, true, true);

	let newFile = new Uint8Array(length);
	let newData = new DataView(newFile.buffer);

	let offset = 0x14;
	offset += data.getUint32(offset, true);

	// Decrease chunk size
	data.setUint32(offset, data.getUint32(offset, true) - amountToDecrease(chars.length, true, false), true);

	// Copy up to glyphs
	let locPLGC = data.getUint32(0x20, true);
	newFile.set(fontU8.subarray(0, locPLGC + 8), 0);

	// Copy glyphs
	for(let i = 0, o = 0; i < fontTiles.length; i++) {
		if(!indexes.find(r => r == i)) {
			newFile.set(fontU8.subarray(locPLGC + 8 + (i * fontTiles[0].length), locPLGC + 8 + ((i + 1) * fontTiles[0].length)), locPLGC + 8 + (o++ * fontTiles[0].length));
		}
	}

	let locHDWC = data.getUint32(0x24, true);
	let newLocHDWC = locHDWC - amountToDecrease(chars.length, true, false);

	// Decrease chunk size
	data.setUint32(locHDWC - 4, data.getUint32(locHDWC - 4, true) - amountToDecrease(chars.length, false, true), true);

	// Decrease HDWC offset
	newData.setUint32(0x24, newLocHDWC, true);

	// Copy widths header
	newFile.set(fontU8.subarray(locHDWC - 8, locHDWC + 8), newLocHDWC - 8);

	// Copy widths
	for(let i = 0, o = 0; i < fontWidths.length; i++) {
		if(!indexes.find(r => r == i)) {
			newFile.set(fontU8.subarray(locHDWC + 8 + (i * 3), locHDWC + 8 + ((i + 1) * 3)), newLocHDWC + 8 + (o++ * 3));
		}
	}

	let locPAMC = data.getUint32(0x28, true);
	let newLocPAMC = locPAMC - amountToDecrease(chars.length, true, true);


	// Increase PAMC offset
	newData.setUint32(0x28, newLocPAMC, true);

	// Copy the rest of the file
	newFile.set(fontU8.subarray(locPAMC - 8, fontU8.length), newLocPAMC - 8);


	// Decrease character maps offsets
	while(newLocPAMC <= newFile.length && newData.getUint32(newLocPAMC + 8, true) != 0) {
		let final = newData.getUint32(newLocPAMC + 4, true) == 2;
		newData.setUint32(newLocPAMC + 8, newData.getUint32(newLocPAMC + 8, true) - amountToDecrease(chars.length, true, true) + (final ? chars.length * 4 : 0), true);
		newLocPAMC = newData.getUint32(newLocPAMC + 8, true);
	}

	// Write new size to header
	newData.setUint32(8, newFile.length, true);

	// Set back to main font buffer
	fontU8 = newFile;
	data = newData;

	// Reload for added bitmaps and widths
	reloadFont(fontU8.buffer);

	// Remove characters from the map
	fontMap = fontMap.filter(r => !chars.find(x => x == r));

	// Regenerate the maps
	regenMaps();

	// Decrease max character
	data.setUint16(newLocHDWC + 2, newData.getUint16(newLocHDWC + 2, true) - chars.length, true);
	reloadFont(fontU8.buffer);
}

function generateFromFont() {
	let ctx = document.createElement("canvas").getContext("2d"); // Create canvas context
	ctx.canvas.width = tileWidth;
	ctx.canvas.height = tileHeight;
	let font = prompt("Enter a font to use", document.getElementById("inputFont").value);
	let regen = confirm("Regerate existing characters?\n\nCancel = No, OK = Yes")
	if(font == null)	return;
	if(font == "")	font = "Sans-Serif";
	ctx.font = tileWidth + "px " + font;

	for(let i in fontMap) {
		if(!regen && !fontTiles[i].every(function(x) { return x == fontTiles[i][0]; }))
			continue;
			
		let char = String.fromCharCode(fontMap[i]);
		console.log(char);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillText(char, 0, tileWidth);
		let image = ctx.getImageData(0, 0, tileWidth, tileHeight);

		let newBitmap = [];
		for(let i = 3; i < image.data.length; i += 4) {
			let colors = [];
			colors.push(Math.sqrt(Math.pow(image.data[i] - palette[0][0], 2)));
			for(let j = 1; j < 4; j++) {
				colors.push(Math.sqrt(Math.pow(image.data[i] - (255 - palette[j][0]), 2)));
			}
			newBitmap.push(colors.indexOf(Math.min.apply(0, colors)));
		}
		let t = getCharIndex(char);
		if(t == questionMark && char != "?")	continue;

		for(let i = 0; i < tileWidth * tileHeight; i += 4) {
			let byte = 0;
			byte |= (newBitmap[i]     & 3) << 6;
			byte |= (newBitmap[i + 1] & 3) << 4;
			byte |= (newBitmap[i + 2] & 3) << 2;
			byte |= (newBitmap[i + 3] & 3) << 0;

			fontTiles[t][i / 4] = byte;
		}

		fontWidths[t][0] = 0;
		fontWidths[t][1] = Math.round(ctx.measureText(char).actualBoundingBoxRight);
		fontWidths[t][2] = Math.round(ctx.measureText(char).actualBoundingBoxRight);
	}
	updateBitmap();
}

function updateFont() {
	document.getElementById("input").style.fontFamily = document.getElementById("inputFont").value;
	document.getElementById("letterInput").style.fontFamily = document.getElementById("inputFont").value;
}

function exportImage() {
	let columns = parseInt(prompt("How many columns do you want?", "32"));
	if(isNaN(columns))	return;

	let ctx = document.createElement("canvas").getContext("2d"); // Create canvas context
	ctx.canvas.width = tileWidth * columns;
	ctx.canvas.height = Math.ceil(fontMap.length / columns) * tileHeight;

	let x = 0, y = 0;
	for(let c in fontMap) {
		let imgData = ctx.createImageData(tileWidth, tileHeight);

		let charImg = new Array(tileHeight * tileWidth);
		for(let i = 0; i < tileSize; i++) {
			charImg[(i * 4)]     = (fontTiles[c][i] >> 6 & 3);
			charImg[(i * 4) + 1] = (fontTiles[c][i] >> 4 & 3);
			charImg[(i * 4) + 2] = (fontTiles[c][i] >> 2 & 3);
			charImg[(i * 4) + 3] = (fontTiles[c][i]      & 3);
		}

		for(let i = 0; i < imgData.data.length / 4; i++) {
			imgData.data[i * 4]     = palette[charImg[i]][0];
			imgData.data[i * 4 + 1] = palette[charImg[i]][1];
			imgData.data[i * 4 + 2] = palette[charImg[i]][2];
			imgData.data[i * 4 + 3] = palette[charImg[i]][3];
		}

		ctx.putImageData(imgData, x, y);
		x += tileWidth
		if(x >= ctx.canvas.width) {
			y += tileHeight;
			x = 0;
		}
	}

	// Download the file
	let binString = atob(ctx.canvas.toDataURL().split(',')[1]);
	let arrBuf = new ArrayBuffer(binString.length);
	let arr = new Uint8Array(arrBuf);
	for(let i in binString) {
		arr[i] = binString.charCodeAt(i);
	}

	let blob = new Blob([arrBuf], {type: "image/png"});
	let a = document.createElement('a');
	let url = window.URL.createObjectURL(blob);
	a.href = url;
	a.download = fileName + ".png";
	a.click();
	window.URL.revokeObjectURL(url);
}

function importImage(file) {
	let reader = new FileReader();
	reader.readAsDataURL(file);

	reader.onload = function() {
		let image = new Image();
		image.src = this.result;
		image.onload = function() {
			let columns = this.width / tileWidth;
			let ctx = document.createElement("canvas").getContext("2d"); // Create canvas context
			ctx.canvas.width = tileWidth * columns;
			ctx.canvas.height = Math.ceil(fontMap.length / columns) * tileHeight;
			ctx.drawImage(this, 0, 0);
			if(this.width != ctx.canvas.width || this.height != ctx.canvas.height) {
				alert("Wrong size image!");
				return;
			}
			for(let c in fontMap) {
				let image = ctx.getImageData((c % columns) * tileWidth, Math.floor(c / columns) * tileHeight, tileWidth, tileHeight);

				let newBitmap = [];
				for(let i = 0; i < image.data.length; i += 4) {
					let colors = [];
					for(let j = 0; j < 4; j++) {
						colors.push(Math.sqrt(Math.pow(image.data[i] - palette[j][0], 2)));
					}
					newBitmap.push(colors.indexOf(Math.min.apply(0, colors)));
				}

				for(let i = 0; i < tileWidth * tileHeight; i += 4) {
					let byte = 0;
					byte |= (newBitmap[i]     & 3) << 6;
					byte |= (newBitmap[i + 1] & 3) << 4;
					byte |= (newBitmap[i + 2] & 3) << 2;
					byte |= (newBitmap[i + 3] & 3) << 0;

					fontTiles[c][i / 4] = byte;
				}
			}
			updateBitmap();
		}
	}
}

function exportSizes() {
	let out = [];
	for(let c of fontMap) {
		c = String.fromCharCode(c);
		let i = getCharIndex(c);
		out.push({
			"char": c,
			"left spacing": fontWidths[i][0],
			"bitmap width": fontWidths[i][1],
			"total width": fontWidths[i][2]
		});
	}

	// Download the file
	let blob = new Blob([JSON.stringify(out, null, 2)], {type: "application/json"});
	let a = document.createElement('a');
	let url = window.URL.createObjectURL(blob);
	a.href = url;
	a.download = fileName + ".json";
	a.click();
	window.URL.revokeObjectURL(url);
}

function importSizes(file) {
	let reader = new FileReader();
	reader.readAsText(file);

	reader.onload = function() {
		let json = JSON.parse(this.result);

		for(let char of json) {
			let i = getCharIndex(char["char"]);
			fontWidths[i][0] = char["left spacing"];
			fontWidths[i][1] = char["bitmap width"];
			fontWidths[i][2] = char["total width"];
		}

		updateBitmap();
	}
}

function sortMaps() {
	let maps = [];
	// Make combined map
	for(let i = 0; i < fontMap.length; i++) {
		maps.push({"map": fontMap[i], "tile": fontTiles[i], "width": fontWidths[i]})
	}

	// Sort by character mappings
	let sorted = maps.sort(function(l, r) {
		if(l.map < r.map) return -1;
		else if(l.map > r.map) return 1;
		return 0;
	});

	// Split back out
	for(let i = 0; i < fontMap.length; i++) {
		fontMap[i] = sorted[i].map;
	}
	console.log(fontTiles, sorted);
	for(let i = 0; i < fontTiles.length; i++) {
		fontTiles[i] = sorted[i].tile;
	}
	for(let i = 0; i < fontWidths.length; i++) {
		fontWidths[i] = sorted[i].width;
	}

	// Copy back to font
	let offset = data.getUint32(0x20, true) + 8;
	for(let i = 0; i < fontTiles.length; i++) {
		fontU8.set(fontTiles[i], offset + (i * fontTiles[0].length));
	}
	offset = data.getUint32(0x24, true) + 8;
	for(let i = 0; i < fontWidths.length; i++) {
		fontU8.set(fontWidths[i], offset + (i * 3));
	}
}

function regenMaps() {
	let maps = [], last = [0, fontMap[0]], range = [[fontMap[0], 0]];

	sortMaps();

	for(let c = 1; c <= fontMap.length; c++) {
		if(fontMap[c] - 1 == last[1]) {
			range.push([fontMap[c], c]);
		} else {
			maps.push(range);
			if(c < fontMap.length)
				range = [[fontMap[c], c]];
		}
		last = [c, fontMap[c]];
	}
	let type2 = [];
	maps.filter(r => r.length <= 0x14).forEach(r => r.forEach(item => type2.push(item)));
	maps = maps.filter(r => r.length > 0x14);

	let ofs = data.getUint32(0x28, true) - 8;

	outMaps = [];
	maps.forEach(function(r) {
		outMaps.push(new CharMap0(r[0][0], r[r.length - 1][0], ofs, r[0][1]))
		ofs = outMaps[outMaps.length - 1].offset + outMaps[outMaps.length - 1].length;
	});
	outMaps.push(new CharMap2(0, 0xFFFF, ofs, type2));

	let newU8 = new Uint8Array(outMaps[outMaps.length - 1].offset + outMaps[outMaps.length - 1].length);
	let newData = new DataView(newU8.buffer);


	// Copy through maps
	ofs = data.getUint32(0x28, true) - 8;
	newU8.set(fontU8.subarray(0, ofs), 0);

	// Set new size in header
	newData.setUint32(0x8, newU8.length, true);
	// Set new chunk count
	newData.setUint16(0xE, 0x3 + outMaps.length, true);

	outMaps.forEach(r => newU8.set(r.get(), r.offset));

	fontU8 = newU8;
	data = newData;

	// Reload font
	reloadFont(fontU8.buffer);
}

function pad(num, length, base = 10) {
	let str = num.toString(base);
	while(str.length < length) {
		str = "0" + str;
	}
	return str;
}

DataView.prototype.setString = function(byteOffset, value) {
	if(typeof(byteOffset) == "number" && typeof(value) == "string") {
		for(let c = 0; c < value.length; c++) {
			this.setUint8(byteOffset + c, value.charCodeAt(c));
		}
	}
}

class CharMap0 {
	// Type 0
	constructor(firstChar, lastChar, offset, firstTile) {
		if(typeof(firstChar) != "number")
			return console.error("Type error! Should be 'number'", firstChar);
		this.firstChar = firstChar;

		if(typeof(lastChar) != "number")
			return console.error("Type error! Should be 'number'", lastChar);
		this.lastChar = lastChar;

		if(typeof(offset) != "number")
			return console.error("Type error! Should be 'number'", offset);
		this.offset = offset;

		if(typeof(firstTile) != "number")
			return console.error("Type error! Should be 'number'", firstTile);
		this.firstTile = firstTile;

		this.length = 0x18;
	}

	get() {
		let arr = new Uint8Array(0x18);
		let data = new DataView(arr.buffer);

		data.setString(0x00, "PAMC"); // ID
		data.setUint32(0x04, this.length, true); // Chunk size
		data.setUint16(0x08, this.firstChar, true); // First char
		data.setUint16(0x0A, this.lastChar, true); // Last char
		data.setUint32(0x0C, 0, true); // Map type
		data.setUint32(0x10, this.offset + 0x18 + 8, true); // Offset to next
		data.setUint16(0x14, this.firstTile, true); // First tile no

		return arr;
	}

	toString() {
		let str = "";
		this.get().forEach(r => str += pad(r, 2, 16));
		return str;
	}
}

// TODO: Char map 1

class CharMap2 {
	// Type 2
	constructor(firstChar, lastChar, offset, pairs) {
		if(typeof(firstChar) != "number")
			return console.error("Type error! Should be 'number'", firstChar);
		this.firstChar = firstChar;

		if(typeof(lastChar) != "number")
			return console.error("Type error! Should be 'number'", lastChar);
		this.lastChar = lastChar;

		if(typeof(offset) != "number")
			return console.error("Type error! Should be 'number'", offset);
		this.offset = offset;

		if(typeof(pairs) != "object")
			return console.error("Type error! Should be 'object'", pairs);
		this.pairs = pairs;

		this.length = 0x14 + 2 + (this.pairs.length * 4) + 2;
	}

	get(zeroForNext = true) {
		let arr = new Uint8Array(this.length);
		let data = new DataView(arr.buffer);

		data.setString(0x00, "PAMC"); // ID
		data.setUint32(0x04, this.length, true); // Chunk size
		data.setUint16(0x08, this.firstChar, true); // First char
		data.setUint16(0x0A, this.lastChar, true); // Last char
		data.setUint32(0x0C, 2, true); // Map type
		data.setUint32(0x10, zeroForNext ? 0 : this.offset + this.length + 8, true); // Offset to next
		data.setUint16(0x14, this.pairs.length, true); // Number of char=tile pairs
		for(let i = 0; i < this.pairs.length; i++) {
			data.setUint16(0x16 + (i * 4), this.pairs[i][0], true); // Char no
			data.setUint16(0x18 + (i * 4), this.pairs[i][1], true); // Tile no
		}

		return arr;
	}

	toString() {
		let str = "";
		this.get().forEach(r => str += pad(r, 2, 16));
		return str;
	}
}

// Remove a specific broken character
function rmAt(index) {
	let chars = [fontMap[index]], indexes = [index];
	let length = fontU8.length - amountToDecrease(chars.length, true, true);

	let newFile = new Uint8Array(length);
	let newData = new DataView(newFile.buffer);

	let offset = 0x14;
	offset += data.getUint32(offset, true);

	// Decrease chunk size
	data.setUint32(offset, data.getUint32(offset, true) - amountToDecrease(chars.length, true, false), true);

	// Copy up to glyphs
	let locPLGC = data.getUint32(0x20, true);
	newFile.set(fontU8.subarray(0, locPLGC + 8), 0);

	// Copy glyphs
	for(let i = 0, o = 0; i < fontTiles.length; i++) {
		if(indexes[0] != i) {
			newFile.set(fontU8.subarray(locPLGC + 8 + (i * fontTiles[0].length), locPLGC + 8 + ((i + 1) * fontTiles[0].length)), locPLGC + 8 + (o++ * fontTiles[0].length));
		}
	}

	let locHDWC = data.getUint32(0x24, true);
	let newLocHDWC = locHDWC - amountToDecrease(chars.length, true, false);

	// Decrease chunk size
	data.setUint32(locHDWC - 4, data.getUint32(locHDWC - 4, true) - amountToDecrease(chars.length, false, true), true);

	// Decrease HDWC offset
	newData.setUint32(0x24, newLocHDWC, true);

	// Copy widths header
	newFile.set(fontU8.subarray(locHDWC - 8, locHDWC + 8), newLocHDWC - 8);

	// Copy widths
	for(let i = 0, o = 0; i < fontWidths.length; i++) {
		if(indexes[0] != i) {
			newFile.set(fontU8.subarray(locHDWC + 8 + (i * 3), locHDWC + 8 + ((i + 1) * 3)), newLocHDWC + 8 + (o++ * 3));
		}
	}

	let locPAMC = data.getUint32(0x28, true);
	let newLocPAMC = locPAMC - amountToDecrease(chars.length, true, true);

	// Increase PAMC offset
	newData.setUint32(0x28, newLocPAMC, true);

	// Copy the rest of the file
	newFile.set(fontU8.subarray(locPAMC - 8, fontU8.length), newLocPAMC - 8);

	// Decrease character maps offsets
	while(newLocPAMC <= newFile.length && newData.getUint32(newLocPAMC + 8, true) != 0) {
		let final = newData.getUint32(newLocPAMC + 4, true) == 2;
		newData.setUint32(newLocPAMC + 8, newData.getUint32(newLocPAMC + 8, true) - amountToDecrease(chars.length, true, true) + (final ? chars.length * 4 : 0), true);
		newLocPAMC = newData.getUint32(newLocPAMC + 8, true);
	}

	// Write new size to header
	newData.setUint32(8, newFile.length, true);

	// Set back to main font buffer
	fontU8 = newFile;
	data = newData;

	// Reload for added bitmaps and widths
	reloadFont(fontU8.buffer);

	// Remove character from the map
	newMap = new Uint16Array(fontMap.length - 1);
	newMap.set(fontMap.subarray(0, indexes[0]), 0);
	newMap.set(fontMap.subarray(indexes[0] + 1, fontMap.length), indexes[0]);
	fontMap = newMap

	// Regenerate the maps
	regenMaps();

	// Decrease max character
	data.setUint16(newLocHDWC + 2, newData.getUint16(newLocHDWC + 2, true) - chars.length, true);
	reloadFont(fontU8.buffer);
}