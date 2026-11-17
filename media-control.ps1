param([string]$Action, [string]$Position)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t=$asTaskGeneric.MakeGenericMethod($type).Invoke($null,@($op)); $t.Wait(-1)|Out-Null; $t.Result }
$mgrType=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$mgr=Await ($mgrType::RequestAsync()) $mgrType
$mode = 'auto'
$s=$mgr.GetCurrentSession()
 if(-not $s){[Console]::WriteLine('false');exit 1}
switch($Action){
 'play' { $op=$s.TryPlayAsync() }
 'pause' { $op=$s.TryPauseAsync() }
 'next' { $op=$s.TrySkipNextAsync() }
 'previous' { $op=$s.TrySkipPreviousAsync() }
 'seek' { $ticks=[long]([double]::Parse($Position,[Globalization.CultureInfo]::InvariantCulture)*10000000); $op=$s.TryChangePlaybackPositionAsync($ticks) }
 default {[Console]::WriteLine('false');exit 1}
}
try{$result=Await $op ([bool]); if($result){[Console]::WriteLine('true')}else{[Console]::WriteLine('false')}}catch{[Console]::WriteLine('false');exit 1}
