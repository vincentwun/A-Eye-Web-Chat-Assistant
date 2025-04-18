$OllamaModel = "gemma3:12b"
$OllamaOrigins = "chrome-extension://*"
$DownloadUrl = "https://ollama.com/download/OllamaSetup.exe"
$DownloadPath = Join-Path $env:TEMP "OllamaSetup.exe"

$IsAdmin = ([System.Security.Principal.WindowsPrincipal][System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Warning "Administrator privileges are required to set the system environment variable."
    Write-Host "Attempting to restart the script as Administrator..."
    try {
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    }
    catch {
        Write-Error "Failed to elevate privileges. Please run this script manually as Administrator."
        Read-Host "Press Enter to exit..."
        Exit 1
    }
    Exit
}

$Host.UI.RawUI.WindowTitle = "Ollama & $OllamaModel Setup Tool v5 (EN)"
Clear-Host
Write-Host "=== Ollama & $OllamaModel Setup Tool v5 (EN) ==="
Write-Host "Script is running with Administrator privileges."

Write-Host "`n[Step 1] Checking Ollama installation..."
$ollamaCmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
$ollamaInstalled = $false

if ($ollamaCmd) {
    Write-Host "Ollama is already installed." -ForegroundColor Green
    $ollamaInstalled = $true
}
else {
    Write-Host "Ollama is not installed. Attempting to download and run the installer..." -ForegroundColor Yellow
    try {
        Write-Host "Downloading Ollama installer..."
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $DownloadPath -UseBasicParsing
        Write-Host "Download complete. Running the installer (please follow on-screen instructions)..." -ForegroundColor Green
        Start-Process -FilePath $DownloadPath -ArgumentList "/S" -Wait -Verbose
        Write-Host "Installer finished. Checking for the Ollama command..."
        Start-Sleep -Seconds 5
        $ollamaCmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
        if ($ollamaCmd) {
            Write-Host "Ollama appears to be installed successfully." -ForegroundColor Green
            $ollamaInstalled = $true
        }
        else {
            Write-Error "Ollama command not found after installation attempt. Please try restarting PowerShell or your computer and run the script again."
        }
    }
    catch {
        Write-Error "An error occurred during download or installation: $($_.Exception.Message)"
        Write-Host "Please check your internet connection or download manually from: $DownloadUrl"
    }
}

if (-not $ollamaInstalled) {
    Read-Host "Ollama installation failed or command not found. Cannot proceed. Press Enter to exit..."
    Exit 1
}

Write-Host "`n[Step 2] Setting environment variables..."
Write-Host "Setting system variable: setx OLLAMA_ORIGINS '$OllamaOrigins' /M"
try {
    setx OLLAMA_ORIGINS "$OllamaOrigins" /M
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "setx command exited with code $LASTEXITCODE. This might be okay if the value was already set. Please verify manually if needed."
    }
    else {
        Write-Host "System environment variable set via setx." -ForegroundColor Green
    }
}
catch {
    Write-Error "An error occurred while setting the system environment variable: $($_.Exception.Message)"
    Read-Host "Press Enter to exit..."
    Exit 1
}

Write-Host "Setting current session variable: \$env:OLLAMA_ORIGINS = '$OllamaOrigins'"
$env:OLLAMA_ORIGINS = $OllamaOrigins
Write-Host "Current session environment variable set." -ForegroundColor Green

Write-Host ""
Write-Host "IMPORTANT: The system-wide OLLAMA_ORIGINS setting might require restarting the Ollama service/application or your computer to take full effect." -ForegroundColor Yellow
Write-Host "Waiting a few seconds..."
Start-Sleep -Seconds 5

Write-Host "`n[Step 3] Pulling Ollama model (if needed) and running..."
Write-Host "Attempting to pull model '$OllamaModel'..."
try {
    ollama pull $OllamaModel
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "ollama pull command failed or model already exists (Exit code: $LASTEXITCODE). Continuing to run..."
    }
    else {
        Write-Host "Model '$OllamaModel' pulled successfully." -ForegroundColor Green
    }
}
catch {
    Write-Warning "Could not execute ollama pull ${OllamaModel}: $($_.Exception.Message). Will try to run anyway."
}

Write-Host "Attempting to open a new CMD window to run 'ollama run $OllamaModel'."
$CmdArgs = "/k ollama run $OllamaModel"
Write-Host "Executing: Start-Process cmd -ArgumentList `"$CmdArgs`""
try {
    $process = Start-Process cmd -ArgumentList $CmdArgs -PassThru
    if ($process) {
        Write-Host "Successfully requested a new window (Process ID: $($process.Id)) to run the model." -ForegroundColor Green
        Write-Host "Please check the new CMD window that popped up. It will remain open until you close it."
    }
    else {
        Write-Warning "Start-Process command did not seem to launch the new process successfully."
        Write-Host "You can try running 'ollama run $OllamaModel' manually in a CMD window to check."
    }
}
catch {
    Write-Error "An error occurred while trying to run the model ${OllamaModel}: $($_.Exception.Message)"
    Write-Host "You can try running 'ollama run $OllamaModel' manually in a CMD window to check."
}

Write-Host "`n[Step 4] Script finished. The 'ollama run' window (if opened successfully) remains open."
Read-Host "Press Enter to close this script window..."