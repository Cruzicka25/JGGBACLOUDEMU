// Add these new methods to the GameBoyAdvanceEmulator prototype (place near other save-related methods)
GameBoyAdvanceEmulator.prototype.enableCloudSaves = function() {
    this.cloudSavesEnabled = true;
    this.GITHUB_TOKEN = ""; // User will need to set this
};

GameBoyAdvanceEmulator.prototype.setGithubToken = function(token) {
    this.GITHUB_TOKEN = token;
};

GameBoyAdvanceEmulator.prototype.saveToGist = async function() {
    if (!this.cloudSavesEnabled || !this.GITHUB_TOKEN) {
        console.error("Cloud saves not configured");
        return null;
    }

    try {
        const saveData = this.IOCore.saves.exportSave();
        const saveType = this.IOCore.saves.exportSaveType();
        const gameName = this.getGameName();
        
        if (!saveData || !gameName) {
            throw new Error("No save data or game name");
        }

        const saveObject = {
            game: gameName,
            data: Array.from(saveData),
            type: saveType,
            timestamp: new Date().toISOString()
        };

        const response = await fetch("https://api.github.com/gists", {
            method: "POST",
            headers: {
                "Authorization": `token ${this.GITHUB_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                files: {
                    "gba_save.json": {
                        content: JSON.stringify(saveObject)
                    }
                },
                public: false,
                description: `GBA Save: ${gameName}`
            })
        });

        if (!response.ok) throw new Error("Gist creation failed");
        
        const gist = await response.json();
        return gist.id;
    } catch (error) {
        console.error("Save to Gist failed:", error);
        throw error;
    }
};

GameBoyAdvanceEmulator.prototype.loadFromGist = async function(gistId) {
    if (!this.cloudSavesEnabled || !this.GITHUB_TOKEN) {
        console.error("Cloud saves not configured");
        return false;
    }

    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                "Authorization": `token ${this.GITHUB_TOKEN}`
            }
        });

        if (!response.ok) throw new Error("Gist fetch failed");
        
        const gist = await response.json();
        const saveFile = gist.files["gba_save.json"];
        
        if (!saveFile) throw new Error("No save file in Gist");
        
        const saveObject = JSON.parse(saveFile.content);
        const saveData = new Uint8Array(saveObject.data);
        
        this.IOCore.saves.importSave(saveData, saveObject.type);
        return true;
    } catch (error) {
        console.error("Load from Gist failed:", error);
        throw error;
    }
};

// Modify the existing exportSave method to optionally use cloud saves
GameBoyAdvanceEmulator.prototype.exportSave = function (useCloud = false) {
    if (this.saveExportHandler && (this.emulatorStatus & 0x3) == 0x1) {
        var save = this.IOCore.saves.exportSave();
        var saveType = this.IOCore.saves.exportSaveType() | 0;
        if (save != null) {
            this.saveExportHandler(this.IOCore.cartridge.name, save);
            this.saveExportHandler("TYPE_" + this.IOCore.cartridge.name, [saveType | 0]);
            
            if (useCloud && this.cloudSavesEnabled) {
                return this.saveToGist();
            }
        }
    }
    return Promise.resolve(null);
};

// Modify the existing importSave method to optionally use cloud saves
GameBoyAdvanceEmulator.prototype.importSave = function (gistId = null) {
    if (gistId && this.cloudSavesEnabled) {
        return this.loadFromGist(gistId).then(success => {
            if (success) {
                this.emulatorStatus = this.emulatorStatus | 0x4;
            }
            return success;
        });
    }

    // Original local save import logic
    if (this.saveImportHandler) {
        var name = this.getGameName();
        if (name != "") {
            var parentObj = this;
            this.emulatorStatus = this.emulatorStatus & 0x1B;
            this.saveImportHandler(name, function (save) {
                parentObj.emulatorStatus = parentObj.emulatorStatus & 0x1B;
                parentObj.saveImportHandler("TYPE_" + name, function (saveType) {
                    if (save && saveType && (parentObj.emulatorStatus & 0x3) == 0x1) {
                        var length = save.length | 0;
                        var convertedSave = getUint8Array(length | 0);
                        if ((length | 0) > 0) {
                            for (var index = 0; (index | 0) < (length | 0); index = ((index | 0) + 1) | 0) {
                                convertedSave[index | 0] = save[index | 0] & 0xFF;
                            }
                            if ((saveType.length | 0) != 1) {
                                parentObj.IOCore.saves.importSave(convertedSave, 0);
                            }
                            else {
                                parentObj.IOCore.saves.importSave(convertedSave, saveType[0] & 0xFF);
                            }
                            parentObj.emulatorStatus = parentObj.emulatorStatus | 0x4;
                        }
                    }
                }, function(){parentObj.emulatorStatus = parentObj.emulatorStatus | 0x4;});
            }, function(){parentObj.emulatorStatus = parentObj.emulatorStatus | 0x4;});
            return Promise.resolve(true);
        }
    }
    this.emulatorStatus = this.emulatorStatus | 0x4;
    return Promise.resolve(false);
};
