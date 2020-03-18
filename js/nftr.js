let tileWidth, tileHeight, tileSize, fontTiles, fontWidths, fontMap, questionMark = -1;
let palette = [[0, 0, 0, 0], [0x28, 0x28, 0x28, 0xFF], [0x90, 0x90, 0x90, 0xFF], [0x28, 0x28, 0x28, 0xFF]];
let paletteHTML = ["", "#282828", "#909090", "#282828"];
let data, fontU8, fileName;

function loadFont(file) {
	if(!file) {
		alert("No file selected!");
		document.getElementById("hidden").style.display = "none";
		return false;
	}
	fileName = file.name;
	
	let reader = new FileReader();
	reader.readAsArrayBuffer(file);
	
	reader.onload = function() { reloadFont(this.result); };
}

function reloadFont(buffer) {
	data = new DataView(buffer);
	fontU8 = new Uint8Array(buffer);
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
	fontTiles = new Uint8Array(buffer.slice(offset, offset + (tileSize * tileAmount)));

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
	offset += 4 + 8;
	fontWidths = new Uint8Array(buffer.slice(offset, offset + (3 * tileAmount)));

	// Load character maps
	fontMap = new Uint16Array(tileAmount);
	let locPAMC = data.getUint32(0x28, true);

	while(locPAMC < fontU8.length) {
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
	document.getElementById("hidden").style.display = "";
	questionMark = getCharIndex("?");
	updateBitmap();
}

function saveFont() {
	// Copy glyphs back in
	let offset = data.getUint32(0x20, true) + 8;
	fontU8.set(fontTiles, offset);

	// Copy widths back in
	offset = data.getUint32(0x24, true) + 8;
	fontU8.set(fontWidths, offset);

	// Download the file
	let blob = new Blob([fontU8], {type: "application/octet-stream"});
	let a = document.createElement('a');
	a.style.display = "none";
	document.body.appendChild(a);
	let url = window.URL.createObjectURL(blob);
	a.href = url;
	a.download = fileName;
	a.click();
	window.URL.revokeObjectURL(url);
}

function getCharIndex(c) {
	// Try a binary search
	let left = 0;
	let right = fontMap.length;

	while(left <= right) {
		let mid = left + ((right - left) / 2);
		if(fontMap[mid] == c.charCodeAt(0)) {
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
		if(fontMap[i] == c.charCodeAt(0))	return i;
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
			charImg[(i * 4)]     = (fontTiles[i + (t * tileSize)] >> 6 & 3);
			charImg[(i * 4) + 1] = (fontTiles[i + (t * tileSize)] >> 4 & 3);
			charImg[(i * 4) + 2] = (fontTiles[i + (t * tileSize)] >> 2 & 3);
			charImg[(i * 4) + 3] = (fontTiles[i + (t * tileSize)]      & 3);
		}
	
		for(let i = 0; i < imgData.data.length / 4; i++) {
			imgData.data[i * 4]     = palette[charImg[i]][0];
			imgData.data[i * 4 + 1] = palette[charImg[i]][1];
			imgData.data[i * 4 + 2] = palette[charImg[i]][2];
			imgData.data[i * 4 + 3] = palette[charImg[i]][3];
		}
	
		if(x + fontWidths[(t * 3) + 2] > canvas.width) {
			y += tileHeight;
			x = 0;
		}
		ctx.putImageData(imgData, x + fontWidths[(t * 3)], y);
		x += fontWidths[(t * 3) + 2];
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
	updateBitmap();
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
		charImg[(i * 4)]     = (fontTiles[i + (t * tileSize)] >> 6 & 3);
		charImg[(i * 4) + 1] = (fontTiles[i + (t * tileSize)] >> 4 & 3);
		charImg[(i * 4) + 2] = (fontTiles[i + (t * tileSize)] >> 2 & 3);
		charImg[(i * 4) + 3] = (fontTiles[i + (t * tileSize)]      & 3);
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
			if(x == (fontWidths[(t * 3) + 2] - fontWidths[(t * 3)])) {
				item.style.borderLeft = "1px solid red";
			} else if(x == fontWidths[(t * 3) + 1]) {
				item.style.borderLeft = "1px solid blue";
			}
			row.appendChild(item);
		}
		document.getElementById("letter").appendChild(row);
	}

	// If the last column is colored, apply it to the table itself
	if((fontWidths[(t * 3) + 2] - fontWidths[(t * 3)]) == tileWidth) {
		document.getElementById("letter").style.borderRight = "1px solid red";
	} else if(fontWidths[(t * 3) + 1] == tileWidth) {
		document.getElementById("letter").style.borderRight = "1px solid blue";
	} else {
		document.getElementById("letter").style.borderRight = "";
	}

	document.getElementById("left").value = fontWidths[(t * 3)];
	document.getElementById("left").max = tileWidth;
	document.getElementById("bitmapWidth").value = fontWidths[(t * 3) + 1];
	document.getElementById("bitmapWidth").max = tileWidth;
	document.getElementById("totalWidth").value = fontWidths[(t * 3) + 2];
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

function brushColor() {
	return document.getElementById("brushColor").value;
}

function updateBrush() {
	document.getElementById("brushColor").style.backgroundColor = paletteHTML[brushColor()];
}

function drawLetter(i) {
	if(event.which) {
		document.getElementById("pixel" + i).style.backgroundColor = paletteHTML[brushColor()];
		document.getElementById("pixel" + i).classList = brushColor();
	}
}

function saveLetter() {
	let char = document.getElementById("letterInput").value;
	let t = getCharIndex(char);

	if(t == questionMark && char[0] != "?")	return;

	for(let i = 0; i < tileWidth * tileHeight; i += 4) {
		let byte = 0;
		byte |= (document.getElementById("pixel" + i).classList[0]) << 6;
		byte |= (document.getElementById("pixel" + (i + 1)).classList[0] & 3) << 4;
		byte |= (document.getElementById("pixel" + (i + 2)).classList[0] & 3) << 2;
		byte |= (document.getElementById("pixel" + (i + 3)).classList[0] & 3) << 0;

		fontTiles[(i/4) + (t * tileSize)] = byte;
	}

	fontWidths[(t * 3)] = document.getElementById("left").value;
	fontWidths[(t * 3) + 1] = document.getElementById("bitmapWidth").value;
	fontWidths[(t * 3) + 2] = document.getElementById("totalWidth").value;

	updateBitmap();
}

function addCharacters() {
	let str = prompt("Enter the characters you want to add: ");
	str = str.split("").sort(function(a, b) { return a.charCodeAt(0) > b.charCodeAt(0); }).join("");
	let chars = "";
	for(let i in str) {
		if(str[i] != str[i-1] && getCharIndex(str[i]) == questionMark && (str[i] != "?" || questionMark == -1) && str.charCodeAt(i) <= 0xFFFF) {
			chars += str[i];
		}
	}

	let length = fontU8.length + amountToIncrease(chars.length, true, true) + (chars.length * 4);

	let newFile = new Uint8Array(length);
	let newData = new DataView(newFile.buffer);

	// Increase chunk size
	data.setUint32(0x30, data.getUint32(0x30, true) + amountToIncrease(chars.length, true, false), true);
	
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
	newData.setUint32(newLocHDWC + 2, newData.getUint32(newLocHDWC + 2, true) + chars.length, true);

	// Increase PAMC offset
	newData.setUint32(0x28, newLocPAMC, true);

	// Copy the rest of the file
	newFile.set(fontU8.subarray(locPAMC - 8, fontU8.length), newLocPAMC - 8);

	let lastPAMC;

	// Increase character maps offsets
	while(newLocPAMC < newFile.length) {
		lastPAMC = newLocPAMC;
		let offset = newLocPAMC;
		newData.setUint32(newLocPAMC + 8, newData.getUint32(newLocPAMC + 8, true) + amountToIncrease(chars.length, true, true), true);
		newLocPAMC = newData.getUint32(newLocPAMC + 8, true);
	}

	// Write new size to header
	newData.setUint32(8, newFile.length, true);

	// Add new characters to last PAMC if type 2
	if(newData.getUint32(lastPAMC + 4, true) == 2) {
		// Chunk size
		newData.setUint32(lastPAMC - 4, newData.getUint32(lastPAMC - 4, true) + (chars.length * 4), true);
		// Last character (if greater than the current)
		if(newData.getUint32(lastPAMC + 2, true) < chars.charCodeAt(chars.length - 1)) {
			newData.setUint32(lastPAMC + 2, chars.charCodeAt(chars.length - 1), true);
		}
		// Offset to next map
		if(newData.getUint32(lastPAMC + 8, true) != 0) { // Apparently 0 can mean the end too, if it does then leave it
			newData.setUint32(lastPAMC + 8, newData.getUint32(lastPAMC + 8, true) + (chars.length * 4), true);
		}
		// Number of char + tile groups
		let oldAmount = newData.getUint16(lastPAMC + 0xC, true);
		newData.setUint32(lastPAMC + 0xC, oldAmount + chars.length, true);

		let offset = lastPAMC + 0xC + (oldAmount * 4);
		let tileNo = newData.getUint16(offset, true);
		offset += 2;
		for(let char of chars) {
			newData.setUint16(offset, char.charCodeAt(0), true);
			offset += 2;
			newData.setUint16(offset, ++tileNo, true);
			offset += 2;
		}
		newFile.fill(0, offset, newFile.length);
	} else {
		alert("Warning! NFTR has been expanded, but the characters must be manually added to a map since the last map is not type 2!\n(The type is + " + newData.getUint32(lastPAMC + 4, true) + ")");
	}

	fontU8 = newFile;
	data = newData;
	
	reloadFont(fontU8.buffer);
}

function amountToIncrease(increaseAmount, tiles, widths) {
	let out = 0;
	if(tiles)	out += increaseAmount * tileSize;
	if(widths)	out += increaseAmount * 3;
	// if(maps)	out += increaseAmount * 4;

	while(out % 4)	out++;
	return out;
}
