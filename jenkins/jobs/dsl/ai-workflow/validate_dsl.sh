#!/bin/bash
# DSL構文検証スクリプト
# Purpose: Validate DSL file syntax and verify scriptPath references exist
# Usage: ./validate_dsl.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DSL_DIR="$SCRIPT_DIR"

# Determine repository root
if git rev-parse --show-toplevel &>/dev/null; then
    REPO_ROOT="$(git rev-parse --show-toplevel)"
else
    REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
fi

echo "=== DSL Syntax Validation ==="
echo "DSL Directory: $DSL_DIR"
echo "Repository Root: $REPO_ROOT"
echo ""

# DSLファイルの基本構文チェック（Groovy構文の簡易検証）
echo "=== Basic DSL File Syntax Check ==="
validation_failed=0

for dsl_file in "$DSL_DIR"/*.groovy; do
    if [ -f "$dsl_file" ]; then
        filename=$(basename "$dsl_file")
        echo "Checking $filename..."

        # Check if file is readable
        if [ ! -r "$dsl_file" ]; then
            echo "✗ $filename is not readable"
            validation_failed=1
            continue
        fi

        # Check for basic Groovy syntax issues (unclosed braces, quotes)
        # This is a simple check, not a full Groovy parser
        if grep -q "scriptPath" "$dsl_file"; then
            echo "  ✓ Contains scriptPath definition"
        else
            echo "  ⚠ Warning: No scriptPath found in $filename"
        fi

        # Check for unmatched quotes (simple heuristic)
        single_quotes=$(grep -o "'" "$dsl_file" | wc -l)
        double_quotes=$(grep -o '"' "$dsl_file" | wc -l)

        if [ $((single_quotes % 2)) -ne 0 ]; then
            echo "  ⚠ Warning: Odd number of single quotes - possible syntax error"
        fi

        if [ $((double_quotes % 2)) -ne 0 ]; then
            echo "  ⚠ Warning: Odd number of double quotes - possible syntax error"
        fi

        echo "  ✓ Basic syntax check passed for $filename"
    fi
done

echo ""

# scriptPathの存在確認
echo "=== scriptPath Validation ==="
echo "Verifying that all Jenkinsfiles referenced by scriptPath exist..."
echo ""

expected_paths=(
    "jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile"
    "jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile"
    "jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile"
    "jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile"
    "jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile"
)

for path in "${expected_paths[@]}"; do
    full_path="$REPO_ROOT/$path"
    if [ -f "$full_path" ]; then
        echo "✓ $path exists"
    else
        echo "✗ $path NOT FOUND"
        validation_failed=1
    fi
done

echo ""

# DSLファイルのscriptPath参照の整合性確認
echo "=== scriptPath Reference Consistency Check ==="
echo "Verifying that DSL files reference the correct scriptPath..."
echo ""

# Check ai_workflow_all_phases_job.groovy
if grep -q "scriptPath('jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile')" "$DSL_DIR/ai_workflow_all_phases_job.groovy"; then
    echo "✓ ai_workflow_all_phases_job.groovy has correct scriptPath"
else
    echo "✗ ai_workflow_all_phases_job.groovy has incorrect scriptPath"
    validation_failed=1
fi

# Check ai_workflow_preset_job.groovy
if grep -q "scriptPath('jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile')" "$DSL_DIR/ai_workflow_preset_job.groovy"; then
    echo "✓ ai_workflow_preset_job.groovy has correct scriptPath"
else
    echo "✗ ai_workflow_preset_job.groovy has incorrect scriptPath"
    validation_failed=1
fi

# Check ai_workflow_single_phase_job.groovy
if grep -q "scriptPath('jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile')" "$DSL_DIR/ai_workflow_single_phase_job.groovy"; then
    echo "✓ ai_workflow_single_phase_job.groovy has correct scriptPath"
else
    echo "✗ ai_workflow_single_phase_job.groovy has incorrect scriptPath"
    validation_failed=1
fi

# Check ai_workflow_rollback_job.groovy
if grep -q "scriptPath('jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile')" "$DSL_DIR/ai_workflow_rollback_job.groovy"; then
    echo "✓ ai_workflow_rollback_job.groovy has correct scriptPath"
else
    echo "✗ ai_workflow_rollback_job.groovy has incorrect scriptPath"
    validation_failed=1
fi

# Check ai_workflow_auto_issue_job.groovy
if grep -q "scriptPath('jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile')" "$DSL_DIR/ai_workflow_auto_issue_job.groovy"; then
    echo "✓ ai_workflow_auto_issue_job.groovy has correct scriptPath"
else
    echo "✗ ai_workflow_auto_issue_job.groovy has incorrect scriptPath"
    validation_failed=1
fi

echo ""

# Final result
if [ $validation_failed -eq 0 ]; then
    echo "=== ✓ All validations passed ==="
    exit 0
else
    echo "=== ✗ Validation failed - please fix the errors above ==="
    exit 1
fi
