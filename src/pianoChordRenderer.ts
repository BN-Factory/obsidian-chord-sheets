import {Chord, Note} from "tonal";
import {ChordToken} from "./sheet-parsing/tokens";

const SVG_NS = "http://www.w3.org/2000/svg";
const START_MIDI = 60; // C4
const END_MIDI = 83;   // B5
const NUM_OCTAVES = 2;
const NUM_WHITE_KEYS = 7 * NUM_OCTAVES; // 14

const SEMI_TO_WHITE: Record<number, number> = {0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6};
const SEMI_TO_BLACK: Record<number, number> = {1: 0, 3: 1, 6: 3, 8: 4, 10: 5};

const inversionStore = new Map<string, number>();

interface ActiveNote {
	midi: number;
	name: string;
	isBass: boolean;
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [key, value] of Object.entries(attrs)) {
		el.setAttribute(key, String(value));
	}
	return el;
}

function getChordNotes(chordToken: ChordToken): string[] {
	const chord = Chord.get(chordToken.chordSymbol.value);
	if (!chord.tonic || chord.notes.length === 0) return [];

	const notes = [...chord.notes];
	if (chord.bass) {
		const bc = Note.chroma(chord.bass);
		if (bc !== undefined && !notes.some(n => Note.chroma(n) === bc)) {
			notes.unshift(chord.bass);
		}
	}
	return notes;
}

function computeInversion(noteNames: string[], inversionIndex: number): ActiveNote[] {
	const notes: ActiveNote[] = [];
	let octave = 4;
	let prev = -1;

	for (let i = 0; i < noteNames.length; i++) {
		const name = noteNames[(inversionIndex + i) % noteNames.length];
		let midi = Note.midi(name + octave);
		while (midi !== null && midi <= prev) {
			octave++;
			midi = Note.midi(name + octave);
		}
		if (midi !== null) {
			notes.push({midi, name, isBass: i === 0});
			prev = midi;
		}
	}
	return notes;
}

function whiteKeyIndex(midi: number): number | null {
	const rel = midi - START_MIDI;
	if (rel < 0 || rel >= NUM_OCTAVES * 12) return null;
	const semi = rel % 12;
	if (!(semi in SEMI_TO_WHITE)) return null;
	return Math.floor(rel / 12) * 7 + SEMI_TO_WHITE[semi];
}

function blackKeyAfterWhite(midi: number): number | null {
	const rel = midi - START_MIDI;
	if (rel < 0 || rel >= NUM_OCTAVES * 12) return null;
	const semi = rel % 12;
	if (!(semi in SEMI_TO_BLACK)) return null;
	return Math.floor(rel / 12) * 7 + SEMI_TO_BLACK[semi];
}

function noteCx(note: ActiveNote, wkw: number): number | null {
	const wki = whiteKeyIndex(note.midi);
	if (wki !== null) return wki * wkw + wkw / 2;
	const aw = blackKeyAfterWhite(note.midi);
	if (aw !== null) return (aw + 1) * wkw;
	return null;
}

function renderPianoSvg(activeNotes: ActiveNote[], width: number): SVGSVGElement {
	const wkw = width / NUM_WHITE_KEYS;
	const wkh = width * 0.35;
	const bkw = wkw * 0.6;
	const bkh = wkh * 0.58;
	const dotR = Math.max(wkw * 0.27, 1.5);
	const kr = 1.5;
	const labelH = Math.max(wkw * 0.75, 7);
	const totalH = wkh + labelH + 1;

	const activeMidi = new Set(activeNotes.map(n => n.midi));
	const bassMidi = activeNotes.find(n => n.isBass)?.midi ?? -1;

	const svg = svgEl("svg", {width, height: totalH, viewBox: `0 0 ${width} ${totalH}`}) as SVGSVGElement;
	svg.classList.add("chord-sheet-piano-keyboard");

	// White keys
	const whiteSemis = [0, 2, 4, 5, 7, 9, 11];
	for (let i = 0; i < NUM_WHITE_KEYS; i++) {
		const oct = Math.floor(i / 7);
		const midi = START_MIDI + oct * 12 + whiteSemis[i % 7];
		const x = i * wkw;
		const d = `M${x},0 L${x + wkw},0 L${x + wkw},${wkh - kr} Q${x + wkw},${wkh} ${x + wkw - kr},${wkh} L${x + kr},${wkh} Q${x},${wkh} ${x},${wkh - kr} Z`;
		const path = svgEl("path", {d});
		path.classList.add("chord-sheet-piano-wk");
		if (activeMidi.has(midi)) path.classList.add("chord-sheet-piano-active");
		svg.appendChild(path);
	}

	// White key separators
	for (let i = 1; i < NUM_WHITE_KEYS; i++) {
		const line = svgEl("line", {x1: i * wkw, y1: 0, x2: i * wkw, y2: wkh});
		line.classList.add("chord-sheet-piano-sep");
		svg.appendChild(line);
	}

	// Black keys
	const blackDefs = [{s: 1, aw: 0}, {s: 3, aw: 1}, {s: 6, aw: 3}, {s: 8, aw: 4}, {s: 10, aw: 5}];
	for (let oct = 0; oct < NUM_OCTAVES; oct++) {
		for (const bk of blackDefs) {
			const midi = START_MIDI + oct * 12 + bk.s;
			const aw = oct * 7 + bk.aw;
			const x = (aw + 1) * wkw - bkw / 2;
			const d = `M${x},0 L${x + bkw},0 L${x + bkw},${bkh - kr} Q${x + bkw},${bkh} ${x + bkw - kr},${bkh} L${x + kr},${bkh} Q${x},${bkh} ${x},${bkh - kr} Z`;
			const path = svgEl("path", {d});
			path.classList.add("chord-sheet-piano-bk");
			if (activeMidi.has(midi)) path.classList.add("chord-sheet-piano-active");
			svg.appendChild(path);
		}
	}

	// Dots + labels for each active note
	for (const note of activeNotes) {
		const isWhite = whiteKeyIndex(note.midi) !== null;
		const inRange = note.midi >= START_MIDI && note.midi <= END_MIDI;
		const cx = inRange ? noteCx(note, wkw) : null;

		if (cx !== null) {
			// Dot
			const cy = isWhite ? wkh - wkw * 0.42 : bkh - bkw * 0.5;
			const r = isWhite ? dotR : dotR * 0.85;
			const dot = svgEl("circle", {cx, cy, r});
			dot.classList.add("chord-sheet-piano-dot");
			if (!isWhite) dot.classList.add("chord-sheet-piano-dot-on-black");
			if (note.isBass) dot.classList.add("chord-sheet-piano-dot-bass");
			svg.appendChild(dot);

			// Note label below keyboard
			const text = svgEl("text", {
				x: cx,
				y: wkh + labelH,
				"text-anchor": "middle",
				"font-size": Math.max(wkw * 0.65, 5.5),
			});
			text.textContent = note.name;
			text.classList.add("chord-sheet-piano-label");
			if (note.isBass) text.classList.add("chord-sheet-piano-label-bass");
			svg.appendChild(text);
		} else {
			// Out-of-range indicator: arrow at the right edge
			const edgeX = width - 2;
			const text = svgEl("text", {
				x: edgeX,
				y: wkh + labelH,
				"text-anchor": "end",
				"font-size": Math.max(wkw * 0.55, 5),
			});
			text.textContent = `${note.name}\u2192`;
			text.classList.add("chord-sheet-piano-label", "chord-sheet-piano-label-overflow");
			svg.appendChild(text);
		}
	}

	return svg;
}

function renderPianoDiagram(
	containerEl: HTMLElement,
	notes: ActiveNote[],
	numPositions: number,
	position: number,
	chordName: string,
	width: number,
) {
	const box = containerEl.querySelector(".chord-sheet-chord-box");
	if (!box) return;
	box.replaceChildren();

	const nameEl = document.createElement("div");
	nameEl.classList.add("chord-sheet-chord-name", "chord-sheet-chord-highlight");
	nameEl.innerText = chordName;
	box.appendChild(nameEl);

	box.appendChild(renderPianoSvg(notes, width));

	const posEl = containerEl.querySelector(".chord-sheet-position");
	const prevBtn = containerEl.querySelector(".chord-sheet-btn-prev-position");
	const nextBtn = containerEl.querySelector(".chord-sheet-btn-next-position");
	if (posEl && prevBtn && nextBtn) {
		posEl.textContent = `${position + 1}`;
		nextBtn.classList.toggle("chord-sheet-pos-btn-enabled", position < numPositions - 1);
		prevBtn.classList.toggle("chord-sheet-pos-btn-enabled", position > 0);
	}
}

export function makePianoChordDiagram(chordToken: ChordToken, width = 100, showControls = true): HTMLElement | undefined {
	const noteNames = getChordNotes(chordToken);
	if (noteNames.length === 0) return undefined;

	const chordSymbol = chordToken.chordSymbol.value;
	const numPositions = noteNames.length;
	const containerEl = document.createElement("div");
	containerEl.classList.add("chord-sheet-chord-diagram");

	const chordBox = document.createElement("div");
	chordBox.classList.add("chord-sheet-chord-box");
	containerEl.appendChild(chordBox);

	let currentPosition = inversionStore.get(chordSymbol) ?? 0;
	if (currentPosition >= numPositions) currentPosition = 0;

	if (showControls && numPositions > 1) {
		const chooser = Object.assign(document.createElement("div"), {className: "chord-sheet-position-chooser"});
		const label = Object.assign(document.createElement("span"), {className: "chord-sheet-position-label"});
		const prev = Object.assign(document.createElement("span"), {className: "chord-sheet-btn-prev-position", textContent: "<"});
		const pos = Object.assign(document.createElement("span"), {className: "chord-sheet-position"});
		const total = Object.assign(document.createElement("span"), {textContent: `/${numPositions}`});
		label.append(pos, total);
		chooser.append(prev, label, Object.assign(document.createElement("span"), {className: "chord-sheet-btn-next-position", textContent: ">"}));
		containerEl.appendChild(chooser);

		chooser.querySelector(".chord-sheet-btn-next-position")!.addEventListener("click", () => {
			if (currentPosition < numPositions - 1) {
				currentPosition++;
				inversionStore.set(chordSymbol, currentPosition);
				renderPianoDiagram(containerEl, computeInversion(noteNames, currentPosition), numPositions, currentPosition, chordSymbol, width);
			}
		});
		chooser.querySelector(".chord-sheet-btn-prev-position")!.addEventListener("click", () => {
			if (currentPosition > 0) {
				currentPosition--;
				inversionStore.set(chordSymbol, currentPosition);
				renderPianoDiagram(containerEl, computeInversion(noteNames, currentPosition), numPositions, currentPosition, chordSymbol, width);
			}
		});
	}

	renderPianoDiagram(containerEl, computeInversion(noteNames, currentPosition), numPositions, currentPosition, chordSymbol, width);
	return containerEl;
}
