export interface Hotspot {
  id: string;
  x: number; // % position on scene
  y: number;
  label: string;
  discovered: boolean;
  item?: string;
}

export interface GameState {
  sanity: number; // 0-100
  currentZone: 1 | 2 | 3;
  inventory: string[];
  solvedPuzzles: string[];
  jinnDistance: number; // 1-5, 1 = in your room
  narrative: string;
  choices: string[];
  hotspots: Hotspot[];
  gamePhase: "playing" | "gameover" | "win_escape" | "win_bargain" | "win_trapped";
  score: number;
}

export const INITIAL_STATE: GameState = {
  sanity: 100,
  currentZone: 1,
  inventory: [],
  solvedPuzzles: [],
  jinnDistance: 5,
  narrative: "You stand before the heavy wooden doors of the abandoned haveli. The air smells of dust and old memories. Your phone flashlight is your only companion.",
  choices: ["Push open the rusted iron gate", "Listen closely at the crack of the door", "Search the surrounding weeds", "Breathe and gather your courage"],
  hotspots: [],
  gamePhase: "playing",
  score: 0,
};
