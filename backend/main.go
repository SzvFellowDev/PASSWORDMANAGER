package main

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type VaultItem struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

var database []VaultItem

const dbFile = "vault.json"

func saveData() {
	data, err := json.MarshalIndent(database, "", "  ")
	if err != nil {
		println("ERROR: Nie można zapisać bazy danych!")
		return
	}
	os.WriteFile(dbFile, data, 0644)
}

func loadData() {
	data, err := os.ReadFile(dbFile)
	if err != nil {
		println("SYSTEM: Brak pliku bazy danych. Tworzenie nowej bazy danych...")
		return
	}
	json.Unmarshal(data, &database)
	println("SYSTEM: Załadowano wpisy z pliku:", len(database))
}

func main() {
	loadData()

	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"http://localhost:5173"}
	config.AllowMethods = []string{"POST", "GET"}
	r.Use(cors.New(config))

	r.POST("/api/add", func(c *gin.Context) {
		var newItem VaultItem

		if err := c.BindJSON(&newItem); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ERROR": "Błędne dane"})
			return
		}

		newItem.ID = time.Now().Format("20060102150405")
		newItem.CreatedAt = time.Now().Format("2006-01-02 15:04:05")

		database = append(database, newItem)
		saveData()

		println("SERWER: Dodano wpis. Baza zapisana.")
		c.JSON(http.StatusOK, gin.H{"STATUS": "Zapisano", "id": newItem.ID})
	})

	r.GET("/api/all", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"items": database})
	})

	println("SYSTEM: Backend startuje na porcie 8080...")
	r.Run(":8080")
}
