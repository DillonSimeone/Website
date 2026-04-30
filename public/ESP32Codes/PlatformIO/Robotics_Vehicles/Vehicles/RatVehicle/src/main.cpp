#include <Arduino.h>
#define forwardInputPin A0
#define leftInputPin A1
#define rightInputPin A2
#define threshold 2 // What the wires reads out as when not being touched.

#define EN_LEFT 6
#define EN_RIGHT 9
#define motor1 7
#define motor2 8
#define motor3 12
#define motor4 11

#define LED 13

#define debug true
#define debugSpeed 1000 //How many milisecond between steps?
int debugCycle = 0; //Counter to show how many times the debug message have been printed.

int moveMode = 0;

void setup() {
  // put your setup code here, to run once:
  Serial.begin(9600);  // Serial monitor
  pinMode(LED, OUTPUT);
  pinMode(forwardInputPin, INPUT);
  pinMode(leftInputPin, INPUT);
  pinMode(rightInputPin, INPUT);
  pinMode(EN_LEFT, OUTPUT);
  pinMode(EN_RIGHT, OUTPUT);
  pinMode(motor1, OUTPUT);
  pinMode(motor2, OUTPUT);
  pinMode(motor3, OUTPUT);
  pinMode(motor4, OUTPUT);
  flashLed(2);
}

void loop() {
  // put your main code here, to run repeatedly:
  int move = checkInputs();
  Serial.println("");
  Serial.print("Move: ");
  Serial.println(move);
  
  if( move == 1 ){
      flashLed(1);
  }

  if(debug){
      delay(debugSpeed);
      debugCycle = 1 + debugCycle;
      Serial.print("Debug Cycle: ");
      Serial.println(debugCycle);
  }
}

void flashLed(int times){
    digitalWrite(LED, HIGH);
    delay(5);
    digitalWrite(LED,LOW);
}

int checkInputs(){
    // 0:stop, 1: forward, 2: turn left, 3: rotate left, 4: turn right, 5: rotate right.
    int moveMode;
    
    int forward = readCapacitivePin(forwardInputPin);
    Serial.println("");
    Serial.print("Forward Input: ");
    Serial.println(forward);

    int left = readCapacitivePin(leftInputPin);
    Serial.print("Left Input: ");
    Serial.println(left);

    int right = readCapacitivePin(rightInputPin);
    Serial.print("Right Input: ");
    Serial.println(right);

    
  if(left > threshold && forward > threshold){
      Serial.println("Left and forward!");
      moveMode = 5;
  } else if (right > threshold && forward > threshold){
      Serial.println("Right and forward!");
      moveMode = 4;
  } else if (left > threshold && right > threshold){ //What if this was right > ... ?
      Serial.println("Left and... Right?");
      moveMode = 69;
  } else if (left > threshold){
      Serial.println("Just Left!");
      moveMode = 3;
  } else if (right > threshold){
      Serial.println("Just Right!");
      moveMode = 2;
  } else if (forward > threshold){
      Serial.println("Just Forward!");
      moveMode = 1;
  } else {
      Serial.println("No wires are being touched!");
      moveMode = 0;
  } 
  return moveMode;
 }

void move(int mode){
  switch(mode){
    case 0: {

      break;
      }
    case 1: {
      flashLed(2);
      break;
      }
    case 2:{
      break;
      }
    case 3:{
      break;
      }
    case 4:{
      break;
      }
    case 5:{
      break;
      }
    case 69:{
      break;
      }
    default:{
      }
    }
  }


// Outputs between 0 - 12. 0 is no power, 12 is ALL OF THE POWER! 4-5 seems to be what happens when I'm touching the wires.
uint8_t readCapacitivePin(int pinToMeasure) {
  // Variables used to translate from Arduino to AVR pin naming
  volatile uint8_t* port;
  volatile uint8_t* ddr;
  volatile uint8_t* pin;
  // Here we translate the input pin number from
  //  Arduino pin number to the AVR PORT, PIN, DDR,
  //  and which bit of those registers we care about.

  byte bitmask;
  port = portOutputRegister(digitalPinToPort(pinToMeasure));
  ddr = portModeRegister(digitalPinToPort(pinToMeasure));
  bitmask = digitalPinToBitMask(pinToMeasure);
  pin = portInputRegister(digitalPinToPort(pinToMeasure));
  // Discharge the pin first by setting it low and output
  *port &= ~(bitmask);
  *ddr  |= bitmask;
  delay(1);
  uint8_t SREG_old = SREG; //back up the AVR Status Register
  // Prevent the timer IRQ from disturbing our measurement
  noInterrupts();
  // Make the pin an input with the internal pull-up on
  *ddr &= ~(bitmask);
  *port |= bitmask;
  // Now see how long the pin to get pulled up. This manual unrolling of the loop
  // decreases the number of hardware cycles between each read of the pin,
  // thus increasing sensitivity.
  uint8_t cycles = 17;
  if (*pin & bitmask) { cycles =  0;}
  else if (*pin & bitmask) { cycles =  1;}
  else if (*pin & bitmask) { cycles =  2;}
  else if (*pin & bitmask) { cycles =  3;}
  else if (*pin & bitmask) { cycles =  4;}
  else if (*pin & bitmask) { cycles =  5;}
  else if (*pin & bitmask) { cycles =  6;}
  else if (*pin & bitmask) { cycles =  7;}
  else if (*pin & bitmask) { cycles =  8;}
  else if (*pin & bitmask) { cycles =  9;}
  else if (*pin & bitmask) { cycles = 10;}
  else if (*pin & bitmask) { cycles = 11;}
  else if (*pin & bitmask) { cycles = 12;}
  else if (*pin & bitmask) { cycles = 13;}
  else if (*pin & bitmask) { cycles = 14;}
  else if (*pin & bitmask) { cycles = 15;}
  else if (*pin & bitmask) { cycles = 16;}
  // End of timing-critical section; turn interrupts back on if they were on before, or leave them off if they were off before

  SREG = SREG_old;
  // Discharge the pin again by setting it low and output
  //  It's important to leave the pins low if you want to 
  //  be able to touch more than 1 sensor at a time - if
  //  the sensor is left pulled high, when you touch
  //  two sensors, your body will transfer the charge between
  //  sensors.
  *port &= ~(bitmask);
  *ddr  |= bitmask;
  return cycles;
}

