#!/usr/bin/env node

// npm 7+ suppresses stdout from postinstall — use stderr instead
const log = (line = '') => process.stderr.write(line + '\n')

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  violet:  '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[97m',
  green:   '\x1b[32m',
  gray:    '\x1b[90m',
}

const v  = c.violet + c.bold
const w  = c.white  + c.bold
const cy = c.cyan
const g  = c.green  + c.bold
const d  = c.dim
const r  = c.reset

log()
log(`${v}  ██████╗ ██╗     ██╗   ██╗██████╗  █████╗ ${r}`)
log(`${v}  ██╔══██╗██║     ██║   ██║██╔══██╗██╔══██╗${r}`)
log(`${v}  ██████╔╝██║     ██║   ██║██████╔╝███████║${r}`)
log(`${v}  ██╔═══╝ ██║     ██║   ██║██╔══██╗██╔══██║${r}`)
log(`${v}  ██║     ███████╗╚██████╔╝██║  ██║██║  ██║${r}`)
log(`${v}  ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝${r}`)
log()
log(`  ${w}@useplura/chat${r} ${g}✓ installed${r}`)
log()
log(`  ${cy}Quick start:${r}`)
log()
log(`  ${d}import { ChatWidget } from ${r}${cy}'@useplura/chat'${r}`)
log()
log(`  ${d}<${r}${w}ChatWidget${r}`)
log(`    ${cy}flowId${r}${d}="${r}${w}YOUR_FLOW_ID${r}${d}"${r}`)
log(`    ${cy}primaryColor${r}${d}="${r}${w}#7c3aed${r}${d}"${r}`)
log(`  ${d}/>${r}`)
log()
log(`  ${g}Docs   ${r}${d}→${r}  https://www.npmjs.com/package/@useplura/chat`)
log()
