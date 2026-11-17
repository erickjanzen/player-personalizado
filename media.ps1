# Lê música atual, capa e tempo via Windows SMTC (Spotify, navegador, etc.)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
$readerType = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
$mgr = Await ($mgrType::RequestAsync()) $mgrType

# Leitura WinRT usando DataReader.LoadAsync, sem depender da ponte AsStreamForRead.
$loadMethod = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function GetThumb($p) {
  $rs = $null; $reader = $null
  try {
    if ($null -eq $p.Thumbnail) { return '' }
    $rs = Await ($p.Thumbnail.OpenReadAsync()) $streamType
    $script:lastThumbMime = 'image/jpeg'
    $bridge = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
    $netStream = $bridge.Invoke($null, @($rs))
    try {
      $size = $netStream.Length
      if ($size -le 0 -or $size -gt 15728640) { return '' }
      $bytes = New-Object byte[] ([int]$size)
      $offset = 0
      while ($offset -lt $bytes.Length) {
        $count = $netStream.Read($bytes, $offset, $bytes.Length - $offset)
        if ($count -le 0) { return '' }
        $offset += $count
      }
      if ($bytes.Length -ge 4 -and $bytes[0] -eq 137 -and $bytes[1] -eq 80) { $script:lastThumbMime = 'image/png' }
    } finally { if ($null -ne $netStream) { $netStream.Dispose() } }
    return [Convert]::ToBase64String($bytes)
  } catch {
    [Console]::Error.WriteLine("CAPA: " + $_.Exception.Message)
    return ''
  } finally {
    if ($null -ne $reader) { try { ([System.IDisposable]$reader).Dispose() } catch {} }
    if ($null -ne $rs) { try { ([System.IDisposable]$rs).Dispose() } catch {} }
  }
}
function PickSession($manager, $mode) {
  $sessions = @($manager.GetSessions())
  if ($mode -eq 'spotify') {
    return @($sessions | Where-Object { $_.SourceAppUserModelId -match 'Spotify' })[0]
  }
  if ($mode -eq 'chrome') {
    return @($sessions | Where-Object { $_.SourceAppUserModelId -match 'chrome' })[0]
  }
  $current = $manager.GetCurrentSession()
  if ($current -and $current.SourceAppUserModelId -match 'Spotify|chrome') { return $current }
  $allowed = @($sessions | Where-Object { $_.SourceAppUserModelId -match 'Spotify|chrome' })
  foreach ($item in $allowed) {
    if ($item.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { return $item }
  }
  if ($allowed.Count) { return $allowed[0] }
  return $null
}
$lastSource = ''
$lastKey = ''; $sent = $false; $tries = 0
while ($true) {
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $propType
      $tl = $s.GetTimelineProperties()
      $status = $s.GetPlaybackInfo().PlaybackStatus.ToString()
      $dur = ($tl.EndTime - $tl.StartTime).TotalSeconds
      $pos = $tl.Position.TotalSeconds
      if ($status -eq 'Playing') { $pos += ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalSeconds }
      if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
      if ($pos -lt 0) { $pos = 0 }
      $source = [string]$s.SourceAppUserModelId
      $key = "$source|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) { $lastSource = ''
$lastKey = $key; $sent = $false; $tries = 0 }
      $o = @{ title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = $status; source = $source; key = $key
              pos = [math]::Round($pos, 1); dur = [math]::Round($dur, 1) }
      # Publica metadados IMEDIATAMENTE, antes de abrir/decodificar a capa.
      # A leitura de thumbnails WinRT pode bloquear; nunca deve atrasar o titulo.
      [Console]::WriteLine(($o | ConvertTo-Json -Compress))
      # a capa costuma chegar com atraso: tenta algumas vezes após a troca
      if (-not $sent -and $tries -lt 60) {
        $tries++
        $th = GetThumb $p
        if ($th) {
          $o.thumb = $th
          try {
            $mime = $script:lastThumbMime
            if (-not $mime) { $mime = 'image/jpeg' }
            $o.thumbMime = $mime
          } catch { $o.thumbMime = 'image/jpeg' }
          $sent = $true
        }
      }
    } else { $lastKey = ''; $sent = $false; $tries = 0; $o = @{ title = ''; artist = ''; status = 'None'; key = ''; pos = 0; dur = 0 } }
    if ($s -and $o.thumb) {
      # Envia a capa como atualização separada da mesma faixa.
      [Console]::WriteLine(($o | ConvertTo-Json -Compress))
    } elseif (-not $s) {
      [Console]::WriteLine(($o | ConvertTo-Json -Compress))
    }
  } catch { [Console]::Error.WriteLine("MEDIA: " + $_.Exception.Message) }
  Start-Sleep -Milliseconds 200
}
