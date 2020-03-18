let tileWidth, tileHeight, tileSize, fontTiles, fontWidths, fontMap, questionMark = 0;
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
	
	reader.onload = function() {
		data = new DataView(this.result);
		fontU8 = new Uint8Array(this.result);
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
		fontTiles = new Uint8Array(this.result.slice(offset, offset + (tileSize * tileAmount)));
	
		// Fix top row
		// TODO: Maybe don't do this? Look into what these mean
		for(let i = 0; i < tileAmount; i++) {
			fontTiles[i * tileSize]     = 0;
			fontTiles[i * tileSize + 1] = 0;
			fontTiles[i * tileSize + 2] = 0;
		}
	
		// Load character widths
		offset = data.getUint32(0x24, true) - 4;
		chunkSize = data.getUint32(offset, true);
		offset += 4 + 8;
		fontWidths = new Uint8Array(this.result.slice(offset, offset + (3 * tileAmount)));
	
		// Load character maps
		fontMap = new Uint16Array(tileAmount);
		let locPAMC = data.getUint32(0x28, true);
	
		while(locPAMC < file.size) {
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
	console.log(char);
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

	let output = "";
	for(let y = 0; y < tileHeight; y++) {
		output += "<tr>"
		for(let x = 0; x < tileWidth; x++) {
			output += "<td id='pixel" + ((y * tileWidth) + x) + "' class='" + charImg[(y * tileWidth) + x] + "'style='background-color:" + paletteHTML[charImg[(y * tileWidth) + x]] + ";' onclick='drawLetter(" + ((y * tileWidth) + x) + ")'></td>";
		}
		output += "</tr>"
	}

	document.getElementById("letter").innerHTML = output;
	document.getElementById("left").value = fontWidths[(t * 3)];
	document.getElementById("bitmapWidth").value = fontWidths[(t * 3) + 1];
	document.getElementById("totalWidth").value = fontWidths[(t * 3) + 2];
}

function brushColor() {
	return document.getElementById("brushColor").value;
}

function updateBrush() {
	document.getElementById("brushColor").style.backgroundColor = paletteHTML[brushColor()];
}

function drawLetter(i) {
	document.getElementById("pixel" + i).style.backgroundColor = paletteHTML[brushColor()];
	document.getElementById("pixel" + i).classList = brushColor();
}

function saveLetter() {
	let char = document.getElementById("letterInput").value;
	let t = getCharIndex(char);

	if(t == questionMark && char[0] != "?")	return;

	for(let i = 0; i < tileWidth * tileHeight; i += 4) {
		let byte = 0;
		console.log("i=" + i)
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
