# Govee API Documentation (Local)

## Base URL
`https://openapi.api.govee.com`

## Authentication
Header: `Govee-API-Key: <YOUR_API_KEY>`
Content-Type: `application/json`

## Endpoints

### 1. Get Devices
**Endpoint:** `GET /router/api/v1/user/devices`

**Response Example:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "sku": "H6052",
      "device": "00:00:00:00:00:00:00:00",
      "deviceName": "Table Lamp",
      "type": "devices.types.light",
      "capabilities": [...]
    }
  ]
}
```

### 2. Control Device
**Endpoint:** `POST /router/api/v1/device/control`

**Payload:**
```json
{
  "requestId": "uuid-string",
  "payload": {
    "sku": "<device_sku>",
    "device": "<device_mac>",
    "capability": {
      "type": "devices.capabilities.on_off",
      "instance": "powerSwitch",
      "value": 1
    }
  }
}
```

**Capability Values:**
- `value`: `1` (On), `0` (Off)
