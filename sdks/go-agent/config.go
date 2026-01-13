package sdk

import (
	"fmt"
	"math/rand"
	"time"
)

// ConfigData holds raw configuration data
type ConfigData struct {
	BaseURL           string
	Token             string
	APIKey            string
	AgentID           string
	CallTimeoutMs     int
	AvailabilitySlaMs int
	LongPollWaitMs    int
	CorrelationID     string
	// gRPC specific
	Host       string
	CACert     string
	ClientCert string
	ClientKey  string
}

// Config holds SDK configuration
type Config struct {
	grpc bool
	data ConfigData
}

// ForRest creates a new Config for REST transport
func ForRest(data ConfigData) *Config {
	// Set defaults
	if data.CallTimeoutMs == 0 {
		data.CallTimeoutMs = 10000
	}
	if data.AvailabilitySlaMs == 0 {
		data.AvailabilitySlaMs = 120000
	}
	if data.LongPollWaitMs == 0 {
		data.LongPollWaitMs = 10000
	}
	if data.CorrelationID == "" {
		data.CorrelationID = generateCorrelationID("go-sdk")
	}

	return &Config{
		grpc: false,
		data: data,
	}
}

// ForGrpc creates a new Config for gRPC transport
func ForGrpc(data ConfigData) *Config {
	// Set defaults
	if data.CallTimeoutMs == 0 {
		data.CallTimeoutMs = 10000
	}
	if data.AvailabilitySlaMs == 0 {
		data.AvailabilitySlaMs = 120000
	}
	if data.LongPollWaitMs == 0 {
		data.LongPollWaitMs = 10000
	}
	if data.CorrelationID == "" {
		data.CorrelationID = generateCorrelationID("go-sdk")
	}

	return &Config{
		grpc: true,
		data: data,
	}
}

// IsGrpc returns true if this config is for gRPC transport
func (c *Config) IsGrpc() bool {
	return c.grpc
}

// Get retrieves a configuration value by key
func (c *Config) Get(key string) interface{} {
	switch key {
	case "baseUrl":
		return c.data.BaseURL
	case "token":
		return c.data.Token
	case "apiKey":
		return c.data.APIKey
	case "agentId":
		return c.data.AgentID
	case "callTimeoutMs":
		return c.data.CallTimeoutMs
	case "availabilitySlaMs":
		return c.data.AvailabilitySlaMs
	case "longPollWaitMs":
		return c.data.LongPollWaitMs
	case "correlationId":
		return c.data.CorrelationID
	case "host":
		return c.data.Host
	case "caCert":
		return c.data.CACert
	case "clientCert":
		return c.data.ClientCert
	case "clientKey":
		return c.data.ClientKey
	default:
		return nil
	}
}

// GetString retrieves a string configuration value
func (c *Config) GetString(key string, defaultValue string) string {
	val := c.Get(key)
	if str, ok := val.(string); ok {
		if str != "" {
			return str
		}
	}
	return defaultValue
}

// GetInt retrieves an int configuration value
func (c *Config) GetInt(key string, defaultValue int) int {
	val := c.Get(key)
	if i, ok := val.(int); ok {
		if i > 0 {
			return i
		}
	}
	return defaultValue
}

// WithCorrelationId creates a new Config with updated correlation ID
func (c *Config) WithCorrelationId(id string) *Config {
	newData := c.data
	newData.CorrelationID = id
	return &Config{
		grpc: c.grpc,
		data: newData,
	}
}

// generateCorrelationID generates a unique correlation ID
func generateCorrelationID(prefix string) string {
	rand.Seed(time.Now().UnixNano())
	randomBytes := make([]byte, 6)
	for i := range randomBytes {
		randomBytes[i] = byte(rand.Intn(256))
	}
	return fmt.Sprintf("%s-%x", prefix, randomBytes)
}

