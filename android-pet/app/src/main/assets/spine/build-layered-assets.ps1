param(
  [string]$Root = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

Add-Type -AssemblyName System.Drawing

$width = 192
$height = 208
$sheet = [Drawing.Bitmap]::FromFile((Join-Path $Root 'spritesheet.png'))
$feeding = [Drawing.Bitmap]::FromFile((Join-Path $Root 'feeding-2.png'))
$drinking = [Drawing.Bitmap]::FromFile((Join-Path $Root 'drinking-2.png'))
$playing = [Drawing.Bitmap]::FromFile((Join-Path $Root 'playing-2.png'))

function Soft-Rect {
  param([int]$X, [int]$Y, [int]$Left, [int]$Top, [int]$Right, [int]$Bottom, [int]$Feather = 8)
  $dx = if ($X -lt $Left) { $Left - $X } elseif ($X -gt $Right) { $X - $Right } else { 0 }
  $dy = if ($Y -lt $Top) { $Top - $Y } elseif ($Y -gt $Bottom) { $Y - $Bottom } else { 0 }
  if ($dx -eq 0 -and $dy -eq 0) { return 1.0 }
  $distance = [Math]::Sqrt($dx * $dx + $dy * $dy)
  return [Math]::Max(0.0, 1.0 - ($distance / [Math]::Max(1, $Feather)))
}

function Soft-Ellipse {
  param([int]$X, [int]$Y, [double]$CenterX, [double]$CenterY, [double]$RadiusX, [double]$RadiusY, [double]$Feather = 7)
  $distance = [Math]::Sqrt([Math]::Pow(($X - $CenterX) / $RadiusX, 2) + [Math]::Pow(($Y - $CenterY) / $RadiusY, 2))
  if ($distance -le 1) { return 1.0 }
  $edgeDistance = ($distance - 1) * [Math]::Min($RadiusX, $RadiusY)
  return [Math]::Max(0.0, 1.0 - ($edgeDistance / [Math]::Max(1, $Feather)))
}

function Teal-Pixel {
  param([Drawing.Color]$Color)
  return ($Color.A -gt 0 -and $Color.G -gt 55 -and $Color.G -gt ($Color.R + 15) -and $Color.B -gt ($Color.R + 5))
}

function Chroma-Spill-Pixel {
  param([Drawing.Color]$Color)
  # Strong matte-green pixels are safe to replace even when a neighboring fur
  # strand makes them look interior.
  return ($Color.A -gt 0 -and $Color.R -ge 160 -and
    $Color.G -gt ($Color.R + 12) -and $Color.B -gt ($Color.R + 8))
}

function Greenish-Edge-Pixel {
  param([Drawing.Color]$Color)
  # The approved no-gear source still contains a green matte fringe in
  # semi-opaque fur pixels. The dog has white fur, so even a small positive
  # green excess is contamination; saturated teal props are excluded because
  # their blue channel is also high.
  return ($Color.A -gt 0 -and
    $Color.G -gt $Color.R -and $Color.G -gt $Color.B)
}

function Real-Fur-Spill-Pixel {
  param([Drawing.Color]$Color)
  # Real feeding/drinking frames also contain bowls. Limit this pass to the
  # neutral green matte signature so saturated cyan bowl pixels stay intact.
  return ($Color.A -gt 0 -and
    $Color.G -gt $Color.R -and $Color.G -gt $Color.B -and
    [Math]::Abs($Color.R - $Color.B) -lt 45)
}

function Has-Transparent-Neighbor {
  param(
    [Drawing.Bitmap]$Source,
    [int]$SourceX,
    [int]$SourceY,
    [int]$X,
    [int]$Y
  )
  for ($dy = -3; $dy -le 3; $dy++) {
    for ($dx = -3; $dx -le 3; $dx++) {
      if ($dx -eq 0 -and $dy -eq 0) { continue }
      $neighborX = $X + $dx
      $neighborY = $Y + $dy
      if ($neighborX -lt 0 -or $neighborX -ge $width -or
          $neighborY -lt 0 -or $neighborY -ge $height) { continue }
      if ($Source.GetPixel($SourceX + $neighborX, $SourceY + $neighborY).A -eq 0) { return $true }
    }
  }
  return $false
}

function Clean-Source-Pixel {
  param(
    [Drawing.Bitmap]$Source,
    [int]$SourceX,
    [int]$SourceY,
    [int]$X,
    [int]$Y,
    [int]$CellLeft,
    [int]$CellTop,
    [bool]$CleanGreen = $false
  )
  $pixel = $Source.GetPixel($SourceX + $X, $SourceY + $Y)
  $strongSpill = Chroma-Spill-Pixel $pixel
  $edgeSpill = $CleanGreen -and (Greenish-Edge-Pixel $pixel)
  if (-not $strongSpill -and -not $edgeSpill) { return $pixel }

  $references = @()
  for ($dy = -3; $dy -le 3; $dy++) {
    for ($dx = -3; $dx -le 3; $dx++) {
      if ($dx -eq 0 -and $dy -eq 0) { continue }
      $neighborX = $X + $dx
      $neighborY = $Y + $dy
      if ($neighborX -lt $CellLeft -or $neighborX -ge ($CellLeft + $width) -or
          $neighborY -lt $CellTop -or $neighborY -ge ($CellTop + $height)) { continue }
      $neighbor = $Source.GetPixel($SourceX + $neighborX, $SourceY + $neighborY)
      if ($neighbor.A -gt 0 -and -not (Chroma-Spill-Pixel $neighbor) -and
          -not (Greenish-Edge-Pixel $neighbor)) { $references += $neighbor }
    }
  }
  if ($references.Count -eq 0) {
    for ($dy = -8; $dy -le 8; $dy++) {
      for ($dx = -8; $dx -le 8; $dx++) {
        if ($dx -eq 0 -and $dy -eq 0) { continue }
        $neighborX = $X + $dx
        $neighborY = $Y + $dy
        if ($neighborX -lt $CellLeft -or $neighborX -ge ($CellLeft + $width) -or
            $neighborY -lt $CellTop -or $neighborY -ge ($CellTop + $height)) { continue }
        $neighbor = $Source.GetPixel($SourceX + $neighborX, $SourceY + $neighborY)
        if ($neighbor.A -gt 0 -and -not (Chroma-Spill-Pixel $neighbor)) { $references += $neighbor }
      }
    }
  }
  if ($references.Count -eq 0) {
    $neutral = [int][Math]::Round((0.299 * $pixel.R) + (0.587 * $pixel.G) + (0.114 * $pixel.B))
    return [Drawing.Color]::FromArgb($pixel.A, $neutral, $neutral, $neutral)
  }
  $red = [int][Math]::Round(($references | Measure-Object -Property R -Average).Average)
  $green = [int][Math]::Round(($references | Measure-Object -Property G -Average).Average)
  $blue = [int][Math]::Round(($references | Measure-Object -Property B -Average).Average)
  return [Drawing.Color]::FromArgb($pixel.A, $red, $green, $blue)
}

function New-Layer {
  param(
    [string]$Name,
    [Drawing.Bitmap]$Source,
    [int]$SourceX = 0,
    [int]$SourceY = 0,
    [scriptblock]$Mask,
    [bool]$CleanGreen = $false
  )

  $outputPath = Join-Path $Root ($Name + '.png')
  $output = New-Object Drawing.Bitmap($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($output)
  $graphics.Clear([Drawing.Color]::Transparent)
  $graphics.Dispose()

  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      $pixel = Clean-Source-Pixel $Source $SourceX $SourceY $x $y 0 0 $CleanGreen
      if ($pixel.A -eq 0) { continue }
      if ($CleanGreen -and (Greenish-Edge-Pixel $pixel)) {
        $neutralGreen = [int][Math]::Round(($pixel.R + $pixel.B) / 2.0)
        if ($neutralGreen -lt $pixel.G) {
          $pixel = [Drawing.Color]::FromArgb($pixel.A, $pixel.R, $neutralGreen, $pixel.B)
        }
      }
      $factor = & $Mask $x $y $pixel
      if ($factor -le 0) { continue }
      $alpha = [int][Math]::Round($pixel.A * [Math]::Min(1.0, $factor))
      if ($alpha -gt 0) {
        $output.SetPixel($x, $y, [Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
      }
    }
  }

  $output.Save($outputPath, [Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose()
  Write-Output ('built ' + $Name + '.png')
}

function Clean-Real-Frame {
  param([string]$Path)

  $source = [Drawing.Bitmap]::FromFile($Path)
  $output = New-Object Drawing.Bitmap($source.Width, $source.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($output)
  $graphics.Clear([Drawing.Color]::Transparent)
  $graphics.Dispose()

  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $pixel = $source.GetPixel($x, $y)
      if ($pixel.A -eq 0) {
        $output.SetPixel($x, $y, [Drawing.Color]::FromArgb(0, 0, 0, 0))
        continue
      }
      if (Real-Fur-Spill-Pixel $pixel) {
        $references = @()
        for ($dy = -3; $dy -le 3; $dy++) {
          for ($dx = -3; $dx -le 3; $dx++) {
            if ($dx -eq 0 -and $dy -eq 0) { continue }
            $nx = $x + $dx
            $ny = $y + $dy
            if ($nx -lt 0 -or $nx -ge $source.Width -or $ny -lt 0 -or $ny -ge $source.Height) { continue }
            $neighbor = $source.GetPixel($nx, $ny)
            if ($neighbor.A -gt 0 -and -not (Real-Fur-Spill-Pixel $neighbor)) { $references += $neighbor }
          }
        }
        if ($references.Count -gt 0) {
          $red = [int][Math]::Round(($references | Measure-Object -Property R -Average).Average)
          $green = [int][Math]::Round(($references | Measure-Object -Property G -Average).Average)
          $blue = [int][Math]::Round(($references | Measure-Object -Property B -Average).Average)
          $pixel = [Drawing.Color]::FromArgb($pixel.A, $red, $green, $blue)
        }
      }
      $output.SetPixel($x, $y, $pixel)
    }
  }

  $temporary = $Path + '.cleaning'
  $output.Save($temporary, [Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose()
  $source.Dispose()
  Move-Item -LiteralPath $temporary -Destination $Path -Force
  Write-Output ('cleaned ' + (Split-Path -Leaf $Path))
}

function Full-Sprite-Green-Pixel {
  param([Drawing.Color]$Color)
  # The full atlas contains only the white dog. Any strongly green visible
  # pixel is a keyed-matte remnant, never an intentional prop color.
  return ($Color.A -gt 0 -and $Color.G -gt ($Color.R + 2) -and $Color.G -gt ($Color.B + 2))
}

function Clean-Full-Spritesheet {
  param([Drawing.Bitmap]$Source)

  $output = New-Object Drawing.Bitmap($Source.Width, $Source.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($output)
  $graphics.Clear([Drawing.Color]::Transparent)
  $graphics.Dispose()

  for ($y = 0; $y -lt $Source.Height; $y++) {
    for ($x = 0; $x -lt $Source.Width; $x++) {
      $pixel = $Source.GetPixel($x, $y)
      if ($pixel.A -eq 0 -or -not (Full-Sprite-Green-Pixel $pixel)) {
        $output.SetPixel($x, $y, $pixel)
        continue
      }

      $references = @()
      for ($radius = 1; $radius -le 10 -and $references.Count -eq 0; $radius++) {
        for ($dy = -$radius; $dy -le $radius; $dy++) {
          for ($dx = -$radius; $dx -le $radius; $dx++) {
            if ($dx -eq 0 -and $dy -eq 0) { continue }
            $nx = $x + $dx
            $ny = $y + $dy
            if ($nx -lt 0 -or $nx -ge $Source.Width -or $ny -lt 0 -or $ny -ge $Source.Height) { continue }
            if (($nx % $width) -eq 0 -or ($nx % $width) -eq ($width - 1) -or ($ny % $height) -eq 0 -or ($ny % $height) -eq ($height - 1)) { continue }
            $neighbor = $Source.GetPixel($nx, $ny)
            if ($neighbor.A -gt 0 -and -not (Full-Sprite-Green-Pixel $neighbor)) { $references += $neighbor }
          }
        }
      }

      if ($references.Count -gt 0) {
        $red = [int][Math]::Round(($references | Measure-Object -Property R -Average).Average)
        $green = [int][Math]::Round(($references | Measure-Object -Property G -Average).Average)
        $blue = [int][Math]::Round(($references | Measure-Object -Property B -Average).Average)
        $pixel = [Drawing.Color]::FromArgb($pixel.A, $red, $green, $blue)
      } else {
        $neutral = [int][Math]::Round(($pixel.R + $pixel.B) / 2.0)
        $pixel = [Drawing.Color]::FromArgb($pixel.A, $neutral, $neutral, $neutral)
      }
      $output.SetPixel($x, $y, $pixel)
    }
  }

  $outputPath = Join-Path $Root 'spritesheet-clean.png'
  $output.Save($outputPath, [Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose()
  Write-Output ('cleaned spritesheet.png -> spritesheet-clean.png')
}

# All pieces stay in the original 192x208 coordinate space. This keeps the
# approved pet silhouette registered while each piece can rotate around its own bone.
Clean-Full-Spritesheet $sheet
New-Layer 'rig-tail' $sheet 0 0 { param($x, $y, $pixel) Soft-Ellipse $x $y 157 122 39 48 9 } $true
New-Layer 'rig-body' $sheet 0 0 { param($x, $y, $pixel) Soft-Rect $x $y 38 82 157 208 10 } $true
New-Layer 'rig-paw-left' $sheet 0 0 { param($x, $y, $pixel) Soft-Ellipse $x $y 61 169 28 46 8 } $true
New-Layer 'rig-paw-right' $sheet 0 0 { param($x, $y, $pixel) Soft-Ellipse $x $y 127 169 29 46 8 } $true
New-Layer 'rig-head' $sheet 0 0 { param($x, $y, $pixel) Soft-Ellipse $x $y 96 58 65 64 9 } $true
New-Layer 'rig-ear-left' $sheet 0 0 { param($x, $y, $pixel) Soft-Ellipse $x $y 43 69 35 49 8 } $true
New-Layer 'rig-ear-right' $sheet 0 0 { param($x, $y, $pixel) Soft-Ellipse $x $y 149 69 35 49 8 } $true

# Closed-eye head taken from the approved sleeping pose family, so sleep is not
# just a fast frame swap while the rest of the rig continues to move.
New-Layer 'rig-head-sleep' $sheet 192 (5 * 208) { param($x, $y, $pixel) Soft-Ellipse $x $y 96 58 65 64 9 } $true

# Props are extracted from the existing action references and remain attached to
# the same coordinate system as the dog layers.
New-Layer 'rig-food-bowl' $feeding 0 0 { param($x, $y, $pixel)
  if ($y -lt 158 -or $x -lt 35 -or $x -gt 157 -or -not (Teal-Pixel $pixel)) { return 0 }
  return (Soft-Rect $x $y 38 158 154 208 6)
}
New-Layer 'rig-water-bowl' $drinking 0 0 { param($x, $y, $pixel)
  if ($y -lt 155 -or $x -lt 38 -or $x -gt 154 -or -not (Teal-Pixel $pixel)) { return 0 }
  return (Soft-Rect $x $y 40 155 152 208 6)
}
New-Layer 'rig-ball' $playing 0 0 { param($x, $y, $pixel)
  if (-not (Teal-Pixel $pixel)) { return 0 }
  return (Soft-Ellipse $x $y 133 180 29 29 5)
}

Get-ChildItem -LiteralPath $Root -File -Filter 'feeding-real-*.png' | ForEach-Object { Clean-Real-Frame $_.FullName }
Get-ChildItem -LiteralPath $Root -File -Filter 'drinking-real-*.png' | ForEach-Object { Clean-Real-Frame $_.FullName }

$sheet.Dispose()
$feeding.Dispose()
$drinking.Dispose()
$playing.Dispose()
