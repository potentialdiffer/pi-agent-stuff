# Autocomplete Debug Guide

This document explains how to enable verbose logging for debugging autocomplete issues in the Mistral Agent Tools extension.

## How to Enable Debug Logging

### Method 1: Environment Variable (Recommended)

Set the `MISTRAL_AUTOCOMPLETE_DEBUG` environment variable to `true` before starting pi:

```bash
# Linux/macOS
export MISTRAL_AUTOCOMPLETE_DEBUG=true
pi

# Or in one line
MISTRAL_AUTOCOMPLETE_DEBUG=true pi

# Windows (PowerShell)
$env:MISTRAL_AUTOCOMPLETE_DEBUG="true"
pi

# Windows (CMD)
set MISTRAL_AUTOCOMPLETE_DEBUG=true
pi
```

### Method 2: Enable DEBUG_MODE

Alternatively, you can enable the general debug mode:

```bash
export MISTRAL_DEBUG=true
pi
```

This will enable all debug logging, including autocomplete logs.

## What Gets Logged

When autocomplete debug is enabled, the following information will be logged to the console:

1. **Tool Registration**:
   - When each tool (OCR, image generation, websearch) is registered
   - Tool details (name, label, description, parameters)

2. **Command Registration**:
   - When each command group is registered
   - Individual command registration

3. **Autocomplete Calls**:
   - When `getArgumentCompletions` is called for any command
   - The prefix that was passed in
   - The number of conversations found in cache (for websearch commands)
   - The number of valid conversations after filtering
   - The exact items being returned

4. **Cache Operations**:
   - When conversations are added to cache
   - Validation of conversation IDs

## Example Log Output

```
[AUTOCOMPLETE DEBUG] Registering OCR tool...
[AUTOCOMPLETE DEBUG] Creating OCR tool...
[AUTOCOMPLETE DEBUG] OCR tool created: { name: 'ocr', label: 'OCR', ... }
[AUTOCOMPLETE DEBUG] Registering OCR tool with pi.registerTool...
[AUTOCOMPLETE DEBUG] OCR tool registered
[AUTOCOMPLETE DEBUG] Registering OCR commands...
[AUTOCOMPLETE DEBUG] OCR commands registered successfully

[AUTOCOMPLETE DEBUG] OCR command getArgumentCompletions called with prefix: ""
[AUTOCOMPLETE DEBUG] OCR command getArgumentCompletions returning: []

[AUTOCOMPLETE DEBUG] Websearch-continue command getArgumentCompletions called with prefix: ""
[AUTOCOMPLETE DEBUG] Websearch-continue: found 2 conversations in cache
[AUTOCOMPLETE DEBUG] Websearch-continue: filtered to 2 valid conversations
[AUTOCOMPLETE DEBUG] Websearch-continue command getArgumentCompletions returning 2 items: [
  { value: 'conv_1234567890...', label: 'conv_1234567890... - "test query..."' },
  { value: 'conv_0987654321...', label: 'conv_0987654321... - "another query..."' }
]
```

## Testing the Fix

To test if the autocomplete issue is fixed:

1. Enable debug logging as described above
2. Start pi
3. Press `/` to trigger slash command autocomplete
4. Check the console for any errors or warnings
5. If you see the error `TypeError: value.startsWith is not a function`, please capture:
   - The full error message and stack trace
   - The autocomplete debug logs leading up to the error
   - The exact text you typed before the error occurred

## Common Issues

### Issue: TypeError on `/` key press
- **Cause**: A command's `getArgumentCompletions` is returning items with non-string `value`
- **Check**: Look for autocomplete logs showing items with `value: undefined`, `value: null`, or `value: [object Object]`

### Issue: TypeError when typing command arguments
- **Cause**: A command's `getArgumentCompletions` is returning items with non-string `value`
- **Check**: Look for the specific command's autocomplete logs and verify all `value` fields are strings

### Issue: No autocomplete suggestions appear
- **Cause**: All `getArgumentCompletions` are returning empty arrays
- **Check**: Verify that commands are registered and their `getArgumentCompletions` functions are being called

## Reporting Issues

When reporting autocomplete issues, please include:

1. The version of pi you're using
2. The version of the mistral-agent-tools extension
3. The exact steps to reproduce the issue
4. The debug log output (with `MISTRAL_AUTOCOMPLETE_DEBUG=true`)
5. Any error messages from the console

This will help us quickly identify and fix the issue.
