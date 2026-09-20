Get-ChildItem -Path "src" -Filter "*.tsx" -Recurse | ForEach-Object {
     = Get-Content .FullName -Raw
     = 
    
    # Backgrounds
     =  -replace '\bbg-slate-950\b', 'bg-slate-50 dark:bg-slate-950'
     =  -replace '\bbg-slate-900\b', 'bg-white dark:bg-slate-900'
     =  -replace '\bbg-slate-800\b', 'bg-slate-100 dark:bg-slate-800'
    
    # Borders
     =  -replace '\bborder-slate-800\b', 'border-slate-200 dark:border-slate-800'
     =  -replace '\bborder-slate-700\b', 'border-slate-300 dark:border-slate-700'
    
    # Text
     =  -replace '\btext-slate-200\b', 'text-slate-800 dark:text-slate-200'
     =  -replace '\btext-slate-300\b', 'text-slate-700 dark:text-slate-300'
     =  -replace '\btext-slate-400\b', 'text-slate-500 dark:text-slate-400'
    
    # Clean up double darks (e.g. if it was already dark:bg-slate-900)
     =  -replace 'dark:bg-slate-50 dark:bg-slate-950', 'dark:bg-slate-950'
     =  -replace 'dark:bg-white dark:bg-slate-900', 'dark:bg-slate-900'
     =  -replace 'dark:bg-slate-100 dark:bg-slate-800', 'dark:bg-slate-800'
     =  -replace 'dark:border-slate-200 dark:border-slate-800', 'dark:border-slate-800'
     =  -replace 'dark:border-slate-300 dark:border-slate-700', 'dark:border-slate-700'
     =  -replace 'dark:text-slate-800 dark:text-slate-200', 'dark:text-slate-200'
     =  -replace 'dark:text-slate-700 dark:text-slate-300', 'dark:text-slate-300'
     =  -replace 'dark:text-slate-500 dark:text-slate-400', 'dark:text-slate-400'
    
    if ( -ne ) {
        Set-Content -Path .FullName -Value  -NoNewline
        Write-Host "Updated "
    }
}
