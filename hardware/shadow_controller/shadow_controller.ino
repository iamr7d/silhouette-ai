// Silhouette.ai controller: drives puppet servos and stage lamps from the browser, and sends
// the puppeteer's controls (potentiometers) back to it.
//
// Board:   Arduino Uno or Nano (any board with I2C and PWM pins works with small changes).
// Servos:  PCA9685 16-channel PWM driver on I2C (address 0x40), channels 0-15.
// Lamps:   LED strips or lamps through logic-level MOSFETs on PWM pins 3, 5, 6, 9, 10, 11 (lamp channels 0-5).
// Inputs:  potentiometers on A0-A3 (A4 and A5 are the I2C pins on an Uno).
// Library: "Adafruit PWM Servo Driver Library" (Arduino Library Manager).
//
// Protocol, 115200 baud, one command per line:
//   S<ch>=<deg>     servo angle, 0..180
//   C<ch>=<speed>   continuous-rotation servo, -100..100 (0 stops)
//   L<ch>=<pct>     lamp brightness, 0..100
//   E1 / E0         start / stop sending inputs
//   ?               reply "SHADOW 1 16"
// The board sends I<pin>=<0..1023> when an input moves.

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

// Pulse widths in microseconds. Check your servos' data sheets; many stop at 500-2500 µs.
const int SERVO_MIN_US = 500;
const int SERVO_MAX_US = 2500;
const int SERVO_STOP_US = 1500;

const uint8_t LAMP_PINS[] = {3, 5, 6, 9, 10, 11};
const uint8_t INPUT_PINS[] = {A0, A1, A2, A3};
const uint8_t LAMP_COUNT = sizeof(LAMP_PINS);
const uint8_t INPUT_COUNT = sizeof(INPUT_PINS);

char line[32];
uint8_t len = 0;
bool sendInputs = false;
int lastIn[INPUT_COUNT];
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(50);  // standard servo frame rate
  for (uint8_t i = 0; i < LAMP_COUNT; i++) {
    pinMode(LAMP_PINS[i], OUTPUT);
    analogWrite(LAMP_PINS[i], 0);
  }
  for (uint8_t i = 0; i < INPUT_COUNT; i++) lastIn[i] = -100;
}

void handle(char *s) {
  char cmd = s[0];
  if (cmd == '?') {
    Serial.println(F("SHADOW 1 16"));
    return;
  }
  if (cmd == 'E') {
    sendInputs = s[1] == '1';
    for (uint8_t i = 0; i < INPUT_COUNT; i++) lastIn[i] = -100;  // resend everything
    return;
  }
  char *eq = strchr(s, '=');
  if (!eq) return;
  int ch = atoi(s + 1);
  long val = atol(eq + 1);
  if (cmd == 'S' && ch >= 0 && ch < 16) {
    val = constrain(val, 0, 180);
    pwm.writeMicroseconds(ch, map(val, 0, 180, SERVO_MIN_US, SERVO_MAX_US));
  } else if (cmd == 'C' && ch >= 0 && ch < 16) {
    val = constrain(val, -100, 100);
    pwm.writeMicroseconds(ch, SERVO_STOP_US + val * 5);
  } else if (cmd == 'L' && ch >= 0 && ch < LAMP_COUNT) {
    val = constrain(val, 0, 100);
    analogWrite(LAMP_PINS[ch], map(val, 0, 100, 0, 255));
  }
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (len) {
        line[len] = 0;
        handle(line);
        len = 0;
      }
    } else if (len < sizeof(line) - 1) {
      line[len++] = c;
    }
  }

  // About 30 updates a second, only for inputs that moved.
  if (sendInputs && millis() - lastSend >= 33) {
    lastSend = millis();
    for (uint8_t i = 0; i < INPUT_COUNT; i++) {
      int v = analogRead(INPUT_PINS[i]);
      if (abs(v - lastIn[i]) > 2) {
        lastIn[i] = v;
        Serial.print('I');
        Serial.print(i);
        Serial.print('=');
        Serial.println(v);
      }
    }
  }
}
