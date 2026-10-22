# Silhouette.ai

A studio for shadow puppetry, in the browser. It begins with **Tholpavakoothu**, the leather shadow puppetry of Kerala
and Tamil Nadu, and also sets up wayang kulit, piying, Karagöz, tholu bommalata, togalu gombeyaata and Ravanachhaya.

**Live:** https://silhouetteai.vercel.app · the studio: https://silhouetteai.vercel.app/studio

A show is staged the way it is performed: a long cotton cloth lit by a row of lamps (21 clay lamps on the vilakku madam
for Tholpavakoothu), and leather figures held against it on sticks. Figures, lamps, story and sound sit on one timeline,
keyframed like a film edit, and the same timeline can drive servos and lamps on an Arduino for real puppets.

## What it does

- **The real screen.** Each tradition's cloth at its real proportions, lit by any number of lamps (clay chirattas,
  brass deepams, oil lamps, bulbs, LEDs, spots, gels), each placed, dimmed and coloured over time.
- **Front and back.** Watch from the audience's side, where the figures are shadows, or from the puppeteers' side,
  mirrored, with the lamps before you.
- **A timeline for figures.** Keyframes for position, tilt, scale, opacity and distance from the cloth (a figure drawn
  back toward the lamps casts a larger, softer shadow), with movements such as walk, bow, strike and loom.
- **3D figures with moving parts.** Each figure is a leather plate that can turn and tilt in space. Cut it into parts
  (head, arm, elbow, legs or a free shape) that turn on their joints, shape the parts on the screen, and see the figure
  in 3D (double-click it).
- **Story and sound.** Scenes with narration, the music of the night, and title cards.
- **Motors.** Drive servos and lamps on an Arduino over Web Serial from the timeline, and perform live with inputs
  from the puppeteer's own controls. See [`hardware/`](hardware/) for the sketch and wiring.
- **Malayalam.** The landing page reads in English or Malayalam (Rachana and Manjari).

## Run it

It is a static site with no build step. Serve the folder and open it:

```bash
python serve.py
```

then visit http://localhost:8765 (the landing page) or http://localhost:8765/studio.html (the studio). `serve.py`
turns off caching so changes show straight away. Web Serial (for motors) needs Chrome or Edge.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `landing.css`, `landing.js` | The landing page: the night is played on the cloth as you scroll |
| `studio.html`, `style.css`, `js/` | The studio (`main.js` wiring, `stage.js` the screen, `rig.js` cut parts, `view3d.js` the 3D view, `motors.js`, `panels.js`, `timeline.js`, `audio.js`, `library.js`, `core.js`) |
| `assets/puppets/` | Figures cut out from museum photographs; `punched/` their punched-leather shadows |
| `hardware/` | Arduino sketch (PCA9685 servo driver) and wiring notes |
| `tools/` | Figure cut-out and punching scripts, and the scripts that render the project films |

## Credits

With thanks to **Vipin Viswanathan Pulavar** for the first lessons in Tholpavakoothu and his mentoring, and to
**Hooman Samani**, UAL Creative Computing Institute, for guidance on robotics. And with respect to the pulavars,
puppeteers and lamp keepers of Kerala's koothumadams, who made this art and have carried it for generations.

Full credits, sources and licences are in [CREDITS.md](CREDITS.md).

## Licence

The code is released under the [MIT Licence](LICENSE). The other material keeps its own terms:

- **Figures:** photographs by Daderot of figures in the Museu do Oriente, Lisbon, Wikimedia Commons, CC0 1.0. The
  punched shadows in `assets/puppets/punched/` are derived from them.
- **Fonts:** Geist, Cinzel, Cormorant Garamond, Marcellus, Manjari and Rachana, all SIL Open Font License 1.1.
- **The Tholpavakoothu recording** (`assets/audio/pavakkoothu.mp3`): its performers and source are still to be credited;
  it is not covered by the MIT licence.
- **The UAL Creative Computing Institute logo** belongs to University of the Arts London and is not covered by the MIT
  licence.

Rahul Raj · UAL Creative Computing Institute, London
