// Scripted kickoff announcements, replayed as if spoken live, so the demo works without a microphone.
// Times follow the real Cloud Native Hackathon schedule (Salt Lake City, Nov 9, 2026).
import { addLine, reset } from "./transcript.js";

const SCRIPT = [
  { t: "10:02", who: "Organizer", en: "Good morning, everyone. Welcome to the Cloud Native Hackathon. Check-in is open at the back if you haven't picked up your badge.", es: "Buenos días a todos. Bienvenidos al Cloud Native Hackathon. El registro está abierto al fondo si aún no han recogido su credencial.", gist: "Check-in is open at the back" },
  { t: "10:03", who: "Organizer", en: "Building starts at eleven. Teams can still form at the front until then.", es: "La construcción empieza a las once. Los equipos todavía pueden formarse al frente hasta entonces.", gist: "Building starts at 11:00, teams can form at the front" },
  { t: "10:05", who: "Organizer", en: "Lunch will be at two o'clock. Vegetarian and gluten-free options are on the left side of the room.", es: "El almuerzo será a las dos. Hay opciones vegetarianas y sin gluten en el lado izquierdo de la sala.", gist: "Lunch at 2:00 PM, dietary options on the left" },
  { t: "10:06", who: "Organizer", en: "There is a panel during lunch. After that we go back to building.", es: "Hay un panel durante el almuerzo. Después volvemos a construir.", gist: "Panel during lunch, then back to building" },
  { t: "10:08", who: "Organizer", en: "Project submissions close at five thirty. You need a public repository and a README with setup instructions.", es: "Los envíos de proyectos cierran a las cinco y media. Necesitan un repositorio público y un README con instrucciones de instalación.", gist: "Submissions close at 5:30 PM, public repo and README required" },
  { t: "10:09", who: "Organizer", en: "Demos run from five thirty. Winners are announced at six thirty, and the after-party starts at seven.", es: "Las demostraciones empiezan a las cinco y media. Los ganadores se anuncian a las seis y media, y la fiesta posterior empieza a las siete.", gist: "Demos from 5:30, winners 6:30, after-party 7:00" },
  { t: "10:10", who: "Organizer", en: "If you need a quiet space, the room at the back left is set aside for that. Ask any organizer.", es: "Si necesitan un espacio tranquilo, la sala al fondo a la izquierda está reservada para eso. Pregunten a cualquier organizador.", gist: "Quiet room at the back left" },
];
const ALREADY_SAID = 4; // lines present when the page first opens, like joining a talk in progress

let timer = null;

// Clears the transcript and plays the script again.
export function startReplay(intervalMs) {
  clearInterval(timer);
  reset();
  SCRIPT.slice(0, ALREADY_SAID).forEach(addLine);
  let next = ALREADY_SAID;
  timer = setInterval(() => {
    if (next < SCRIPT.length) addLine(SCRIPT[next++]);
    else clearInterval(timer);
  }, intervalMs);
}
