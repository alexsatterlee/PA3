#include <WiFiS3.h>
#include "arduino_secrets.h"

WiFiClient client;

const int micPin = A0;
const int thresholdValue = 50;              // Trigger level (peak-to-peak)
const unsigned long sampleWindow = 50;      // Milliseconds to sample
const unsigned long cooldownMs = 1000;      // Minimum gap between POSTs

unsigned long lastSentMs = 0;
bool hasSent = false;

void connectWiFi() {
  Serial.println("Connecting to Wi-Fi...");

  while (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(SECRET_SSID, SECRET_PASS);
    delay(5000);
  }

  Serial.print("Connected! IP Address: ");
  Serial.println(WiFi.localIP());
}

// Sends one reading to the server. Returns false if the connection failed.
bool sendLevel(int level) {
  if (!client.connect(SERVER_HOST, SERVER_PORT)) {
    Serial.println("Connection to server failed.");
    return false;
  }

  String body = "{\"level\":" + String(level) + "}";

  client.println("POST /api/sensor HTTP/1.1");
  client.print("Host: ");
  client.println(SERVER_HOST);
  client.println("Content-Type: application/json");
  client.print("Content-Length: ");
  client.println(body.length());
  client.println("Connection: close");
  client.println();
  client.print(body);  // print, not println: Content-Length must match exactly

  // Show the server response (up to 3 seconds), then free the socket.
  unsigned long start = millis();
  while ((client.connected() || client.available()) && millis() - start < 3000) {
    while (client.available()) {
      Serial.write(client.read());
    }
  }
  Serial.println();
  client.stop();
  return true;
}

void setup() {
  Serial.begin(9600);
  while (!Serial && millis() < 3000);  // Wait for the Serial Monitor, but not forever

  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned int signalMax = 0;
  unsigned int signalMin = 1023;

  // Collect data
  unsigned long startMillis = millis();
  while (millis() - startMillis < sampleWindow) {
    unsigned int sample = analogRead(micPin);
    if (sample < 1023) {  // Clean out extra high readings
      if (sample > signalMax) {
        signalMax = sample;  // Save just the max
      }
      if (sample < signalMin) {
        signalMin = sample;  // Save just the min
      }
    }
  }

  // Unsigned math: guard against wrap-around if every sample was filtered out
  unsigned int peakToPeak = (signalMax >= signalMin) ? signalMax - signalMin : 0;
  float db = 20.0 * log10(peakToPeak + 1);

  Serial.print("Amplitude: ");
  Serial.print(peakToPeak);
  Serial.print(" | Estimated dB: ");
  Serial.println(db);

  bool cooledDown = !hasSent || (millis() - lastSentMs >= cooldownMs);

  if (peakToPeak > thresholdValue && cooledDown) {
    Serial.println("ALERT: Audio threshold exceeded!");
    sendLevel((int)peakToPeak);
    lastSentMs = millis();  // Set even on failure so a dead server isn't hammered
    hasSent = true;
  }
}
