# Silhouette.ai hardware

Drive real shadow puppets with servos, light real lamps, and perform with knobs, all from the
Motors tab in Silhouette.ai. The browser talks to an Arduino over USB using Web Serial, which
works in Chrome and Edge on a computer.

## Parts

- Arduino Uno or Nano
- PCA9685 16-channel servo driver board
- Hobby servos (for example MG90S for small figures, MG996R for heavy leather figures)
- A separate 5 to 6 V supply for the servos, rated for all of them together (about 1 A per small servo when moving)
- For lamps: 12 V LED strip or lamps, logic-level MOSFETs (for example IRLZ44N), and a 12 V supply
- Potentiometers (10 kΩ) for the puppeteer's controls

## Wiring

| From | To |
|---|---|
| PCA9685 VCC, GND, SDA, SCL | Arduino 5V, GND, A4, A5 |
| PCA9685 V+ and GND (servo power terminal) | Servo supply + and − |
| Servo connectors | PCA9685 channels 0–15 (output channel in the Motors tab) |
| MOSFET gates | Arduino pins 3, 5, 6, 9, 10, 11 = lamp channels 0–5 (100 Ω in series, 10 kΩ to GND) |
| Lamp − side | MOSFET drain; lamp + side to the 12 V supply; MOSFET source to GND |
| Potentiometers | Ends to 5V and GND, wiper to A0–A3 (input pins 0–3) |

Join all grounds: the Arduino, the servo supply and the lamp supply.

## Setting up

1. Install the Arduino IDE and the "Adafruit PWM Servo Driver Library" from the Library Manager.
2. Open `shadow_controller/shadow_controller.ino` and upload it to the board.
3. In Silhouette.ai, open the Motors tab and click **Connect board**. Pick the Arduino's port.
4. Add outputs. Each output reads one property from the timeline (for example "Rama · Position X")
   and drives one servo channel or lamp channel. **Auto-map selection** creates outputs for the
   selected character: a slide servo for position, a tilt servo for rotation, and one servo per jointed part.
5. Set **Out** to the angles your rig can move through safely before you press play.
6. Add inputs to perform live: an input reads a potentiometer and moves a property on screen.
   Turn on **Record controls** and play the sequence to save that performance as keyframes.

## Protocol

One command per line at 115200 baud: `S<ch>=<deg>` (servo), `C<ch>=<speed>` (continuous servo),
`L<ch>=<percent>` (lamp), `E1` / `E0` (inputs on or off), `?` (the board replies `SHADOW 1 16`).
The board sends `I<pin>=<0..1023>` when an input moves.

## Safety

- Never power servos from the Arduino's 5V pin; use the separate supply.
- Start with narrow **Out** ranges and widen them once the rig moves freely.
- Keep flames away from leather, cloth and servos. LED lamps are the safer choice near the screen.
