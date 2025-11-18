# Sist. Embarcados 2025.2  
## Projeto Final — Sistemas Embarcados  

**Professores:** Izabella Nunes & Jymmy Barreto  

**Equipe:**  
- Bruno Ribeiro  (brlla@cesar.school)
- Ian Nunes  (ibn@cesar.school)
- Paulo Portella  (phcp@cesar.school)
- Vinicius Petribu  (vclp@cesar.school)

---

##  Visão Geral do Projeto
Este repositório contém o projeto final da disciplina **Sistemas Embarcados (CESAR School — 2025.2)**.  
O objetivo principal é desenvolver um sistema **IoT completo**, utilizando **ESP32**, sensores/atuadores e comunicação via **MQTT**, com visualização em tempo real em um dashboard hospedado em um Raspberry Pi.

Nosso projeto consiste em um **sistema de detecção de presença** utilizando **sensor PIR** integrado ao ESP32, que envia os eventos para um broker MQTT. Um LED indica visualmente o estado de presença, variando o brilho via PWM.

---

##  Objetivos
- Integrar **ESP32**, sensor PIR e LED via PWM.  
- Implementar comunicação **Wi-Fi + MQTT**.  
- Configurar broker **Mosquitto** no Raspberry Pi.  
- Criar **dashboard web** para visualização dos eventos de presença.  
- Utilizar versionamento com **GitHub** e documentar o sistema.

---

##  Arquitetura do Sistema
[PIR] → ESP32 → Wi-Fi → MQTT Broker (Raspberry Pi) → Dashboard Web
↓
LED (PWM)

---

##  Hardware Utilizado
- 1x ESP32 DevKit v1  
- 1x Sensor PIR HC-SR501  
- 1x LED vermelho  
- 1x Resistor 220Ω  
- Cabos jumper  
- Protoboard  
- Raspberry Pi com Mosquitto MQTT Broker  

---

##  Principais Tecnologias
- **ESP32 (Arduino Core)**
- **MQTT (Mosquitto)**
- **Wi-Fi**
- **Node.js / Flask / Node-RED** (dashboard)
- **FreeRTOS** (opcional)
- **Git & GitHub**

---

##  Fluxo MQTT
**Tópico utilizado:**

casa/sala/presenca

**Payloads possíveis:**
- `"1"` → presença detectada  
- `"0"` → ausência de presença  

---

##  Funcionamento do ESP32
- Lê o movimento do sensor PIR.  
- Quando há movimento:
  - LED acende com brilho forte (PWM = 255).  
  - Publica `"1"` no MQTT.  
- Após 5 segundos sem movimento:
  - LED reduz para brilho baixo (PWM = 60).  
  - Publica `"0"` no MQTT.  

---

##  Estrutura do Repositório

/
├── esp32-esp8266/ # Código-fonte do ESP32
├── raspberry-pi/ # Scripts do broker e dashboard
├── schematics/ # Diagramas eletrônicos (Fritzing/KiCad)
├── docs/ # Relatório ABNT + imagens
└── README.md # Este arquivo

---

##  Como executar o projeto

### 1. Configurar o broker MQTT no Raspberry Pi
sudo apt update
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto

### 2. Rodar o ESP32
Abra o código na Arduino IDE ou PlatformIO

Configure SSID, senha e IP do broker MQTT

Faça o upload para o ESP32

### 3. Testar MQTT (opcional)
mosquitto_sub -h <IP_DO_RASPBERRY> -t casa/sala/presenca

## 📊 Dashboard
O dashboard exibe:

Estado atual de presença (Ativo / Inativo)

Histórico em gráfico

Última detecção

(Adicionar prints depois.)
