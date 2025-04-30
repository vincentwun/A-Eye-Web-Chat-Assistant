# Define script variables.
$OllamaModel = "gemma3:12b"
$OllamaOrigins = "chrome-extension://*"
$DownloadUrl = "https://ollama.com/download/OllamaSetup.exe"
$DownloadPath = Join-Path $env:TEMP "OllamaSetup.exe"

# Check for Administrator privileges and elevate if necessary.
$IsAdmin = ([System.Security.Principal.WindowsPrincipal][System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Warning "Administrator privileges required. Attempting elevation..."
    try {
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    }
    catch {
        Write-Error "Failed to elevate. Please run script as Administrator."
        Read-Host "Press Enter to exit..." ; Exit 1
    }
    Exit
}

# Configure the console window appearance.
$Host.UI.RawUI.WindowTitle = "Ollama & $OllamaModel Setup Tool"
Clear-Host
Write-Host "=== Ollama & $OllamaModel Setup Tool ==="
Write-Host "Running with Administrator privileges."

# Check if Ollama is installed and install it if missing.
$ollamaCmd = Get-Command ollama.exe -ErrorAction SilentlyContinue

if (-not $ollamaCmd) {
    Write-Host "Ollama not found. Downloading and installing..." -ForegroundColor Yellow
    try {
        Write-Host "Downloading from $DownloadUrl..."
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $DownloadPath -UseBasicParsing
        Write-Host "Download complete. Running silent install..."
        Start-Process -FilePath $DownloadPath -ArgumentList "/S" -Wait -Verbose
        Write-Host "Install command finished. Verifying installation..."
        Start-Sleep -Seconds 3
        $ollamaCmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
        if (-not $ollamaCmd) {
            Write-Error "Ollama command still not found after installation attempt."
            Read-Host "Press Enter to exit..." ; Exit 1
        }
        Write-Host "Ollama installed successfully." -ForegroundColor Green
        Write-Host "Cleaning up installer file..."
        Remove-Item $DownloadPath -ErrorAction SilentlyContinue -Force
    }
    catch {
        Write-Error "Error during Ollama download/installation: $($_.Exception.Message)"
        Write-Host "Please check connection or download manually: $DownloadUrl"
        Read-Host "Press Enter to exit..." ; Exit 1
    }
}
else {
    Write-Host "Ollama is already installed ($($ollamaCmd.Source))." -ForegroundColor Green
}

# Set the required environment variable for Ollama.
Write-Host "Setting system variable (setx): OLLAMA_ORIGINS='$OllamaOrigins'"
try {
    setx OLLAMA_ORIGINS "$OllamaOrigins" /M
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "setx exited with code $LASTEXITCODE. This might be okay (e.g., value unchanged). Verify if needed."
    }
    else {
        Write-Host "System environment variable set via setx." -ForegroundColor Green
    }
}
catch {
    Write-Error "Error setting system environment variable: $($_.Exception.Message)"
    Read-Host "Press Enter to exit..." ; Exit 1
}

Write-Host "Setting current session variable: \$env:OLLAMA_ORIGINS = '$OllamaOrigins'"
$env:OLLAMA_ORIGINS = $OllamaOrigins
Write-Host "Current session environment variable set." -ForegroundColor Green
Write-Host "`nReminder: System-wide change may need Ollama service restart or system reboot." -ForegroundColor Yellow

# Pull the specified Ollama model and run it in a new window.
Write-Host "Attempting: ollama pull $OllamaModel"
ollama pull $OllamaModel
if ($LASTEXITCODE -ne 0) {
    Write-Warning "ollama pull exited with code $LASTEXITCODE (might be okay if model exists). Continuing to run attempt..."
}
else {
    Write-Host "Model '$OllamaModel' pulled successfully or already exists." -ForegroundColor Green
}

Write-Host "Attempting to run model in new CMD window: ollama run $OllamaModel"
$CmdArgs = "/k ollama run $OllamaModel"
try {
    $process = Start-Process cmd -ArgumentList $CmdArgs -PassThru
    if ($process) {
        Write-Host "New CMD window requested (PID: $($process.Id)) to run the model." -ForegroundColor Green
    }
    else {
        Write-Warning "Start-Process did not return a process object. Check if the new window opened."
    }
}
catch {
    Write-Error "Error starting 'ollama run $OllamaModel': $($_.Exception.Message)"
    Write-Host "You can try running 'ollama run $OllamaModel' manually in CMD."
}

# Display final messages and wait for user input to exit.
Write-Host "`nScript finished. Check the separate CMD window for 'ollama run'."
Read-Host "Press Enter to close this script window..."