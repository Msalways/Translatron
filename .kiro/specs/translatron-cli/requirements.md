# Requirements Document

## Introduction

Translatron is a deterministic, incremental, build-time translation compiler that leverages LLMs to translate application strings while treating localization as a pure compile step. It acts as a development dependency that integrates seamlessly into CI/CD pipelines, providing extremely cost-efficient translations by only processing new or changed strings while respecting developer manual overrides forever.

## Glossary

- **Translation_Compiler**: The core system that processes source strings and generates translations using LLMs
- **Source_Unit**: A single translatable string with its context and metadata
- **Translation_Plan**: A collection of source units that need translation for specific target languages
- **Ledger**: SQLite database storing hashes and metadata for incremental processing
- **Manual_Override**: Developer-modified translation that should be preserved from automatic regeneration
- **Provider**: LLM service provider (OpenAI, Anthropic, Groq, etc.)
- **Extractor**: Component that identifies and extracts translatable strings from source files
- **Validator**: Component that ensures translation quality and correctness

## Requirements

### Requirement 1: Core Translation Processing

**User Story:** As a developer, I want to translate application strings using LLMs at build time, so that I can localize my application without runtime overhead.

#### Acceptance Criteria

1. WHEN the system processes source files, THE Translation_Compiler SHALL extract translatable strings and convert them to Source_Units
2. WHEN Source_Units are identified, THE Translation_Compiler SHALL compute content hashes for change detection
3. WHEN translation is requested, THE Translation_Compiler SHALL generate a Translation_Plan containing only new or modified strings
4. WHEN the Translation_Plan is executed, THE Translation_Compiler SHALL call the configured LLM Provider with structured prompts
5. WHEN translations are received, THE Translation_Compiler SHALL validate them against placeholder preservation and structural requirements
6. WHEN translations are validated, THE Translation_Compiler SHALL write them to target files atomically

### Requirement 2: Incremental Processing

**User Story:** As a developer, I want only changed strings to be translated, so that I can minimize LLM costs and processing time.

#### Acceptance Criteria

1. WHEN the system starts, THE Translation_Compiler SHALL load the previous state from the Ledger
2. WHEN comparing source strings, THE Translation_Compiler SHALL identify new, modified, and unchanged strings using content hashes
3. WHEN building the Translation_Plan, THE Translation_Compiler SHALL include only strings that have changed since the last successful run
4. WHEN processing is complete, THE Translation_Compiler SHALL update the Ledger with new hashes and status information
5. WHEN no changes are detected, THE Translation_Compiler SHALL complete without making LLM calls

### Requirement 3: Manual Override Protection

**User Story:** As a developer, I want my manual translation edits to be preserved, so that I can maintain control over specific translations.

#### Acceptance Criteria

1. WHEN the system detects a target file hash mismatch, THE Translation_Compiler SHALL mark the translation as Manual_Override
2. WHEN a Manual_Override is detected, THE Translation_Compiler SHALL skip automatic translation for that key-language pair
3. WHEN the force flag is not set, THE Translation_Compiler SHALL preserve all Manual_Override translations
4. WHEN the force flag is set, THE Translation_Compiler SHALL regenerate Manual_Override translations and update their status
5. WHEN updating the Ledger, THE Translation_Compiler SHALL record Manual_Override status for future runs

### Requirement 4: Provider Agnostic Architecture

**User Story:** As a developer, I want to use different LLM providers, so that I can choose the best service for my needs and avoid vendor lock-in.

#### Acceptance Criteria

1. WHEN configuring the system, THE Translation_Compiler SHALL accept provider-specific configuration for any supported Provider
2. WHEN making translation requests, THE Translation_Compiler SHALL use the configured Provider interface
3. WHEN a Provider fails, THE Translation_Compiler SHALL optionally fall back to a secondary Provider if configured
4. WHEN switching providers, THE Translation_Compiler SHALL maintain translation state and history
5. WHEN recording translations, THE Translation_Compiler SHALL store the Provider fingerprint for audit purposes

### Requirement 5: Validation and Quality Assurance

**User Story:** As a developer, I want translations to be validated for correctness, so that I can ensure quality and prevent errors in my application.

#### Acceptance Criteria

1. WHEN translations are received, THE Validator SHALL verify structural correctness using the configured schema
2. WHEN checking placeholders, THE Validator SHALL ensure all source placeholders are preserved in translations
3. WHEN validating semantics, THE Validator SHALL detect source text leakage and inappropriate length changes
4. WHEN validation fails, THE Validator SHALL retry with modified parameters or mark the translation as failed
5. WHEN all validation passes, THE Validator SHALL approve the translation for writing

### Requirement 6: File System Operations

**User Story:** As a developer, I want translations written safely to files, so that I can avoid data corruption and maintain file integrity.

#### Acceptance Criteria

1. WHEN writing translations, THE Translation_Compiler SHALL read the current target file content
2. WHEN merging translations, THE Translation_Compiler SHALL preserve existing translations not being updated
3. WHEN writing files, THE Translation_Compiler SHALL use atomic operations (write to temporary file then rename)
4. WHEN file operations fail, THE Translation_Compiler SHALL report errors and maintain system state consistency
5. WHEN operations complete successfully, THE Translation_Compiler SHALL update the Ledger transactionally

### Requirement 7: Configuration Management

**User Story:** As a developer, I want to configure the translation system, so that I can customize behavior for my project needs.

#### Acceptance Criteria

1. WHEN initializing, THE Translation_Compiler SHALL load configuration from translatron.config.ts
2. WHEN validating configuration, THE Translation_Compiler SHALL use Zod schema validation
3. WHEN configuration is invalid, THE Translation_Compiler SHALL report specific validation errors
4. WHEN configuration changes, THE Translation_Compiler SHALL detect changes and invalidate cached state appropriately
5. WHEN running, THE Translation_Compiler SHALL apply all configured rules, extractors, and validation settings

### Requirement 8: CLI Interface

**User Story:** As a developer, I want to interact with the translation system via CLI commands, so that I can integrate it into my development workflow and CI/CD pipelines.

#### Acceptance Criteria

1. WHEN running sync command, THE Translation_Compiler SHALL perform incremental translation processing
2. WHEN running init command, THE Translation_Compiler SHALL scaffold configuration files and directory structure
3. WHEN running status command, THE Translation_Compiler SHALL display coverage statistics and system state
4. WHEN running check command, THE Translation_Compiler SHALL validate all target files without making changes
5. WHEN commands complete, THE Translation_Compiler SHALL exit with appropriate status codes for CI integration

### Requirement 9: State Management and Persistence

**User Story:** As a developer, I want the system to maintain state reliably, so that I can have consistent and reproducible builds.

#### Acceptance Criteria

1. WHEN initializing state, THE Ledger SHALL create SQLite database with proper schema
2. WHEN storing hashes, THE Ledger SHALL record source content hashes and sync status for each key-language pair
3. WHEN updating state, THE Ledger SHALL use database transactions to ensure consistency
4. WHEN recovering from interruption, THE Ledger SHALL maintain data integrity and allow resumption
5. WHEN querying state, THE Ledger SHALL provide efficient access to change detection information

### Requirement 10: Audit and Reporting

**User Story:** As a developer, I want detailed reports of translation activities, so that I can monitor costs, debug issues, and maintain audit trails.

#### Acceptance Criteria

1. WHEN processing completes, THE Translation_Compiler SHALL generate a run report with translation statistics
2. WHEN making LLM calls, THE Translation_Compiler SHALL track token usage and estimated costs
3. WHEN storing audit data, THE Translation_Compiler SHALL record model fingerprints and prompt versions
4. WHEN requested, THE Translation_Compiler SHALL provide detailed history for specific translation keys
5. WHEN generating reports, THE Translation_Compiler SHALL include human-readable diffs and change summaries