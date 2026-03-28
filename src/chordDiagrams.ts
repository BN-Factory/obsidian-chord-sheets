import {chordSequenceString, findDbChord, Instrument, UserDefinedChord} from "./chordsUtils";
import {ChordBox} from "@chordbook/charts";
import ChordsDB, {ChordDef} from "@tombatossals/chords-db";
import {ChordToken} from "./sheet-parsing/tokens";
import {makePianoChordDiagram} from "./pianoChordRenderer";

type ChordBoxParams = Parameters<ChordBox["draw"]>[0];

export function dbChordToVexChord(input: ChordDef, positionIndex = 0): ChordBoxParams {
	const position = input.positions[positionIndex];
	const fingers = [...position.fingers].reverse();
	const frets = [...position.frets].reverse();

	const barres: ChordBoxParams["barres"] = [];
	position.barres.forEach((barreFret) => {
		const toString = frets.indexOf(barreFret) + 1;
		const fromString = frets.lastIndexOf(barreFret) + 1;

		if (fromString > 0 && toString > 0) {
			barres.push({fromString, toString, fret: barreFret});
		}
	});

	const chord = frets
		.map((fret, index) => [index + 1, fret === -1 ? 'x' : fret] as [number, number])
		.filter(c => !barres.some(barre => c[1] === barre.fret))
	;

	return {
		chord,
		position: position.baseFret,
		barres,
		// abuse tuning labels for fingering
		tuning: [...fingers].reverse().map(finger => finger > 0 ? `${finger}` : '')
	};
}

export function userDefinedToVexChord({frets, position}: UserDefinedChord, numStrings: number, defaultNumFrets: number = 4): ChordBoxParams & { numFrets: number } {
	const splitFrets = /[\s,]/.test(frets) ? frets.match(/\d+|x|_/g) : frets.split('');

	if (!splitFrets) {
		throw new Error("Could not parse fret string: " + frets);
	}


	const barres: ChordBoxParams["barres"] = [];

	const barrePositions = splitFrets
		.map((fret, index) => (fret === '_' ? index : -1))
		.filter(index => index !== -1);

	if (barrePositions.length === 2 || barrePositions.length === 4) {
		barres.push({
			fromString: numStrings - barrePositions[0],
			toString: numStrings - barrePositions[1] + 2,
			fret: parseInt(frets[barrePositions[0] + 1])
		});
	}
	if (barrePositions.length === 4) {
		barres.push({
			fromString: numStrings - barrePositions[2] + 2,
			toString: numStrings - barrePositions[3] + 4,
			fret: parseInt(frets[barrePositions[2] + 1])
		});
	}


	// map frets to chord array, skip barre markers
	let chordFrets = splitFrets
		.filter(fretSymbol => fretSymbol !== "_")
		.map(
			(fret, index) => [numStrings - index, fret === "x" ? "x" : parseInt(fret)]
		);


	// determine optimal fret position
	let finalPosition = position;
	if (position === 0) {
		const originalFrets = chordFrets
			.map(fretDef => fretDef[1])
			.filter(fret => typeof fret === 'number' && !isNaN(fret)) as number[];
		
		const nonOpenFrets = originalFrets.filter(fret => fret > 0);
		if (nonOpenFrets.length > 0) {
			const minFret = Math.min(...nonOpenFrets);
			const maxFret = Math.max(...nonOpenFrets);
			const fretSpan = maxFret - minFret + 1;
			
			// if chord spans more than available frets, or starts above fret 3 (treat low frets with muted strings like open chords)
			if (fretSpan > defaultNumFrets || minFret > 3) {
				// position at minFret to show the most compact view
				finalPosition = minFret;
				chordFrets = chordFrets.map(fretDef =>
					typeof fretDef[1] === 'number' && fretDef[1] > 0 ? [fretDef[0], fretDef[1] - finalPosition + 1] : fretDef
				);
			}
			// else: position remains 0
		}
	}


	const finalFrets = chordFrets
		.map(fretDef => fretDef[1])
		.filter(fret => typeof fret === 'number' && !isNaN(fret)) as number[];


	const numFrets = finalFrets.length > 0
		? Math.max(defaultNumFrets, Math.max(...finalFrets))
		: defaultNumFrets;

	return {
		// @ts-ignore
		chord: chordFrets,
		position: finalPosition,
		barres,
		numFrets,
		// empty string labels so spacing is equal to non-custom chords with string labels
		tuning: new Array(numStrings).fill('')
	};
}

export function renderChordDiagram({containerEl, userDefinedChord, chordDef, numPositions, position, numStrings, numFrets, chordName, width}: {
	containerEl: HTMLElement,
	userDefinedChord: UserDefinedChord | undefined,
	chordDef: ChordDef,
	numPositions: number,
	position: number,
	numStrings: number,
	numFrets: number,
	chordName: string,
	width: number
}) {
	const box = containerEl.querySelector(".chord-sheet-chord-box");
	if (!box) {
		return;
	}

	box.replaceChildren();

	box.appendChild(makeChordNameEl(chordName));

	const chordDiagram = document.createElement("div");
	box.appendChild(chordDiagram);

	const vexChord = userDefinedChord
		? userDefinedToVexChord(userDefinedChord, numStrings, numFrets)
		: dbChordToVexChord(chordDef, position);

	makeChordBox(chordDiagram, numStrings, numFrets, width).draw(vexChord);

	updateChordPosition(containerEl, numPositions, position);
}

function makeChordNameEl(chordName: string) {
	const chordNameEl = document.createElement("div");
	chordNameEl.classList.add("chord-sheet-chord-name", "chord-sheet-chord-highlight");
	chordNameEl.innerText = chordName;
	return chordNameEl;
}

function makeChordBox(containerEl: HTMLElement, numStrings: number, numFrets: number, width: number, defaultColor = "var(--text-normal)") {
	return new ChordBox(containerEl, {
		numStrings: numStrings,
		numFrets: numFrets,
		showTuning: true,
		defaultColor: defaultColor,
		fontFamily: "var(--font-text)",
		width: width,
		height: width * 1.2
	});
}

function renderMissingDiagramNotice(box: HTMLElement, chordName: string, numStrings: number, numFrets: number, width: number) {
	const emptyFretboardEl = document.createElement("div");
	emptyFretboardEl.classList.add("chord-sheet-no-diagram");
	const fretboard = makeChordBox(emptyFretboardEl, numStrings, numFrets, width, "var(--text-faint)");
	fretboard.draw({chord: [], tuning: new Array(numStrings).fill('')});

	const gridCenterX = fretboard.x + fretboard.spacing * (fretboard.numStrings - 1) / 2;
	const gridCenterY = fretboard.y + fretboard.fretSpacing * fretboard.numFrets / 2;
	fretboard.canvas.plain("?")
		.attr({x: gridCenterX, y: gridCenterY})
		.addClass("chord-sheet-no-diagram-mark");

	emptyFretboardEl.setAttribute("aria-label", `No diagram found for ${chordName}`);
	emptyFretboardEl.setAttribute("data-tooltip-position", "top");

	box.append(makeChordNameEl(chordName), emptyFretboardEl);
}

function updateChordPosition(containerEl: HTMLElement, numPositions: number, position: number) {
	const positionEl = containerEl.querySelector(".chord-sheet-position");
	const prevBtn = containerEl.querySelector(".chord-sheet-btn-prev-position");
	const nextBtn = containerEl.querySelector(".chord-sheet-btn-next-position");

	if (positionEl && prevBtn && nextBtn) {
		positionEl.textContent = `${position + 1}`;
		if (position < numPositions - 1) {
			nextBtn.addClass("chord-sheet-pos-btn-enabled");
		} else {
			nextBtn.removeClass("chord-sheet-pos-btn-enabled");
		}

		if (position > 0) {
			prevBtn.addClass("chord-sheet-pos-btn-enabled");
		} else {
			prevBtn.removeClass("chord-sheet-pos-btn-enabled");
		}
	}
}

export function makeChordDiagram(instrument: Instrument, chordToken: ChordToken, width = 100, position = 0, showControls = true) {
	if (instrument === "piano") {
		return makePianoChordDiagram(chordToken, width, showControls);
	}

	const containerEl = document.createElement("div");
	containerEl.addClass("chord-sheet-chord-diagram");
	const chordBox: HTMLDivElement = document.createElement('div');
	chordBox.addClass("chord-sheet-chord-box");
	containerEl.appendChild(chordBox);

	const instrumentChordDb = ChordsDB[instrument];
	const numStrings = instrumentChordDb.main.strings;
	const numFrets = instrumentChordDb.main.fretsOnChord;

	if (chordToken.chord.userDefinedChord !== undefined) {

		const vexChord = userDefinedToVexChord(chordToken.chord.userDefinedChord, numStrings, numFrets);

		renderChordDiagram({
			containerEl: containerEl,
			userDefinedChord: chordToken.chord.userDefinedChord,
			chordDef: {key: "", suffix: "", positions: []},
			numPositions: 1,
			position: vexChord.position ?? 1,
			numStrings: numStrings,
			numFrets: vexChord.numFrets,
			chordName: chordToken.chordSymbol.value,
			width: width
		});
	}
	else {
		const dbChord = findDbChord(chordToken, instrumentChordDb);
		if (!dbChord) {
			renderMissingDiagramNotice(chordBox, chordToken.chordSymbol.value, numStrings, numFrets, width);
			return containerEl;
		}

		let currentPosition = position;
		const numPositions = dbChord.positions.length;
		if (numPositions > 0) {
			const positionChooser = Object.assign(document.createElement('div'), {
				className: "chord-sheet-position-chooser"
			});

			const positionLabelSpan = Object.assign(document.createElement('span'), {
				className: "chord-sheet-position-label",
			});

			const prevPositionSpan = Object.assign(document.createElement("span"), {
				className: "chord-sheet-btn-prev-position",
				textContent: "<"
			});

			const positionSpan = Object.assign(document.createElement("span"), {
				className: "chord-sheet-position"
			});
			const numPositionSpan = Object.assign(document.createElement("span"), {
				textContent: `/${numPositions}`
			});
			positionLabelSpan.append(positionSpan, numPositionSpan);

			const nextPositionSpan = Object.assign(document.createElement("span"), {
				className: "chord-sheet-btn-next-position",
				textContent: ">"
			});

			positionChooser.append(prevPositionSpan, positionLabelSpan, nextPositionSpan);
			containerEl.appendChild(positionChooser);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nextPositionButton = positionChooser.querySelector(".chord-sheet-btn-next-position")!;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const prevPositionButton = positionChooser.querySelector(".chord-sheet-btn-prev-position")!;

			nextPositionButton.addEventListener("click", () => {
				if (currentPosition < numPositions - 1) {
					renderChordDiagram({
						containerEl: containerEl,
						userDefinedChord: undefined,
						chordDef: dbChord,
						numPositions: numPositions,
						position: ++currentPosition,
						numStrings: numStrings,
						numFrets: numFrets,
						chordName: chordToken.chordSymbol.value,
						width: width
					});
				}
			});
			prevPositionButton.addEventListener("click", () => {
				if (currentPosition > 0) {
					renderChordDiagram({
						containerEl: containerEl,
						userDefinedChord: undefined,
						chordDef: dbChord,
						numPositions: numPositions,
						position: --currentPosition,
						numStrings: numStrings,
						numFrets: numFrets,
						chordName: chordToken.chordSymbol.value,
						width: width
					});
				}
			});
		}

		renderChordDiagram({
			containerEl: containerEl,
			userDefinedChord: undefined,
			chordDef: dbChord,
			numPositions: numPositions,
			position: position,
			numStrings: numStrings,
			numFrets: numFrets,
			chordName: chordToken.chordSymbol.value,
			width: width
		});
	}

	return containerEl;
}

export function makeChordOverview(instrument: Instrument, container: HTMLElement, chordTokens: ChordToken[], width?: number) {
	for (const chordToken of chordTokens) {
		const chordBox = makeChordDiagram(instrument, chordToken, width);
		if (chordBox) {
			container.appendChild(chordBox);
		}
	}
	container.dataset.chordSequence = chordSequenceString(chordTokens);
	container.dataset.instrument = instrument;
	container.dataset.diagramWidth = `${width}`;
}
