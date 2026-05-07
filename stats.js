document.addEventListener('DOMContentLoaded', () => {
    function showNotification(message, type = 'info', duration = 4000) {
        const container = document.getElementById('notificationContainer');

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };

        notification.innerHTML = `
            <span class="notification-icon">${icons[type]}</span>
            <div class="notification-content">
                <div class="notification-title">${titles[type]}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">×</button>
        `;

        container.appendChild(notification);

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            removeNotification(notification);
        });

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                removeNotification(notification);
            }, duration);
        }
    }

    function removeNotification(notification) {
        notification.classList.add('hiding');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }


    function normalizeTalentName(name) {
        return name.replace(/\s*\[(HVY|MED|LGT|HEAVY|MEDIUM|LIGHT|CHA|INT|WIL|STR|FTD|AGI|FLM|ICE|LTN|WND|SDW|MTL|BLD)\]\s*$/i, '').trim();
    }

    // Tab Navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });

    // CONSTANTS
    const MAX_TOTAL_POINTS = 330;
    const MAX_STAT_VALUE = 100;
    const BOTTLENECK_LIMIT = 25;

    const shrineResultsModal = document.getElementById('shrineResultsModal');

    function syncToOptimizer(statName, preValue, postValue) {
        // Find the corresponding stat row in the optimizer tab
        const optimizerRow = document.querySelector(`#optimizer-tab .stat-row[data-stat="${statName}"]`);
        if (!optimizerRow) return;

        // Get the first input group
        const firstInputGroup = optimizerRow.querySelector('.input-group');
        const firstInput = firstInputGroup.querySelector('input[type="number"]');
        const firstSelect = firstInputGroup.querySelector('.condition-select');

        // Only update if condition is set to "any"
        if (firstSelect.value === 'any') {
            const maxValue = Math.max(preValue, postValue);
            firstInput.value = maxValue;
        }
    }

    function handleInputValidation(input) {
        let value = parseInt(input.value) || 0;
        value = Math.max(0, Math.min(100, value));
        input.value = value;
    }

    // ==========================================
    // STAT CHANGE LOST TALENT VALIDATION
    // ==========================================

    // Collect all selected talents that would become unavailable given hypothetical pre/post stats
    function getInvalidatedTalents(newPre, newPost) {
        const preDerived = calculateBodyAndMind(newPre);
        const postDerived = calculateBodyAndMind(newPost);
        // Power derived from post-shrine point total using shared helper
        const currentPower = getPowerFromStatTotal(newPost);

        const invalidated = [];

        for (const id of selectedTalents) {
            const talent = allTalents.find(t => t.id === id);
            if (!talent) continue;

            const reqs = getTalentRequirements(talent);
            if (reqs.length === 0) continue;

            // Check Power requirements
            let powerOk = true;
            for (const req of reqs) {
                if (req.isPower || req.stat === 'Power') {
                    if (currentPower < req.value) { powerOk = false; break; }
                }
            }

            const nonPowerReqs = reqs.filter(r => !r.isPower && r.stat !== 'Power');

            const metIn = (stats, derived) => nonPowerReqs.every(req => {
                const val = (req.stat === 'Body' || req.stat === 'Mind')
                    ? (derived[req.stat] || 0)
                    : (stats[req.stat] || 0);
                return val >= req.value;
            });

            const statOk = nonPowerReqs.length === 0 || metIn(newPre, preDerived) || metIn(newPost, postDerived);

            if (!powerOk || !statOk) {
                invalidated.push(talent);
            }
        }
        return invalidated;
    }

    // Get all selected talents that depend (via reqs.from) on the given talent
    function getDependentSelectedTalents(baseTalent) {
        const dependents = [];
        for (const id of selectedTalents) {
            const t = allTalents.find(x => x.id === id);
            if (!t || t.id === baseTalent.id) continue;
            const required = getRequiredTalentNames(t);
            if (required.some(name => normalizeTalentName(name).toLowerCase() === normalizeTalentName(baseTalent.name).toLowerCase())) {
                dependents.push(t);
            }
        }
        return dependents;
    }

    // Show the lost-talent modal and return a promise resolving to 'confirm' or 'cancel'
    function showStatChangeLostTalentModal(lostTalents, allToRemove, revertFn, commitFn) {
        const modal = document.getElementById('statChangeLostTalentModal');
        const msg = document.getElementById('statChangeLostTalentMessage');
        const lostList = document.getElementById('statChangeLostTalentList');
        const depSection = document.getElementById('statChangeDependentsSection');
        const depList = document.getElementById('statChangeDependentsList');
        const confirmBtn = document.getElementById('statChangeLostConfirmBtn');
        const cancelBtn = document.getElementById('statChangeLostCancelBtn');

        msg.textContent = `The following talent${lostTalents.length > 1 ? 's' : ''} will no longer be available with your new stats:`;

        lostList.innerHTML = '';
        lostTalents.forEach(t => {
            const li = document.createElement('li');
            li.textContent = t.name;
            lostList.appendChild(li);
        });

        const dependents = allToRemove.filter(t => !lostTalents.find(l => l.id === t.id));
        if (dependents.length > 0) {
            depSection.style.display = '';
            depList.innerHTML = '';
            dependents.forEach(t => {
                const li = document.createElement('li');
                li.textContent = t.name;
                depList.appendChild(li);
            });
        } else {
            depSection.style.display = 'none';
            depList.innerHTML = '';
        }

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            cleanup();
            allToRemove.forEach(t => selectedTalents.delete(t.id));
            if (commitFn) commitFn();
            renderBothPanels();
            showNotification(`Removed ${allToRemove.length} talent${allToRemove.length > 1 ? 's' : ''} that are no longer available.`, 'warning');
        };

        const onCancel = () => {
            cleanup();
            revertFn();
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    }

    // Apply stat input change, checking for newly-invalidated selected talents
    function applyStatInputChange(input) {
        let value = parseInt(input.value) || 0;
        value = Math.max(0, Math.min(100, value));
        input.value = value;

        const statRow = input.closest('.stat-row.simple');
        const statName = statRow.getAttribute('data-stat');
        const dualGroup = input.closest('.dual-input-group');
        const preInput = dualGroup.querySelector('.pre-shrine');
        const postInput = dualGroup.querySelector('.post-shrine');

        syncToOptimizer(statName, parseInt(preInput.value) || 0, parseInt(postInput.value) || 0);
        updateSparePoints();

        if (selectedTalents.size === 0) {
            input.dataset.lastValid = parseInt(input.value) || 0;
            renderBothPanels();
            return;
        }

        // Build hypothetical pre/post stats with the new value
        const { pre: newPre, post: newPost } = collectPrePostStats();
        const invalidated = getInvalidatedTalents(newPre, newPost);

        if (invalidated.length === 0) {
            input.dataset.lastValid = parseInt(input.value) || 0;
            renderBothPanels();
            return;
        }

        // Collect all dependents of invalidated talents
        const toRemoveSet = new Set(invalidated.map(t => t.id));
        invalidated.forEach(t => {
            getDependentSelectedTalents(t).forEach(dep => toRemoveSet.add(dep.id));
        });
        const allToRemove = Array.from(toRemoveSet).map(id => allTalents.find(t => t.id === id)).filter(Boolean);

        // Remember the old value so we can revert (before we saved the new one as lastValid)
        const oldValue = input.dataset.lastValid !== undefined ? parseInt(input.dataset.lastValid) : 0;
        const revertFn = () => {
            input.value = oldValue;
            input.dataset.lastValid = oldValue;
            syncToOptimizer(statName, parseInt(preInput.value) || 0, parseInt(postInput.value) || 0);
            updateSparePoints();
            renderBothPanels();
        };

        // Don't update lastValid yet — wait for user to confirm
        const commitFn = () => { input.dataset.lastValid = parseInt(input.value) || 0; };
        showStatChangeLostTalentModal(invalidated, allToRemove, revertFn, commitFn);
        return; // early return — modal handles the rest
    }

    // Setup input validation for simple inputs
    const setupSimpleInputValidation = (input) => {
        const statRow = input.closest('.stat-row.simple');
        const statName = statRow.getAttribute('data-stat');

        // Track the last committed valid value so we can revert on cancel
        input.dataset.lastValid = parseInt(input.value) || 0;

        input.addEventListener('blur', () => {
            applyStatInputChange(input);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyStatInputChange(input);
                input.blur();
            }
        });

        input.addEventListener('keypress', (e) => {
            if (!/[0-9]/.test(e.key) &&
                e.key !== 'Backspace' &&
                e.key !== 'Delete' &&
                e.key !== 'ArrowLeft' &&
                e.key !== 'ArrowRight' &&
                e.key !== 'Tab') {
                e.preventDefault();
            }
        });

        // Add input event for live updates
        input.addEventListener('input', () => {
            updateSparePoints();
        });
    };

    // Apply validation to all simple inputs in stats tab
    document.querySelectorAll('#stats-tab .simple-input').forEach(input => {
        setupSimpleInputValidation(input);
    });

    function calculateBodyAndMind(stats) {
        const bodyStats = ['Strength', 'Fortitude', 'Agility'];
        const mindStats = ['Intelligence', 'Willpower', 'Charisma'];

        const body = Math.max(
            stats['Strength'] || 0,
            stats['Fortitude'] || 0,
            stats['Agility'] || 0
        );

        const mind = Math.max(
            stats['Intelligence'] || 0,
            stats['Willpower'] || 0,
            stats['Charisma'] || 0
        );

        return { Body: body, Mind: mind };
    }

    function collectManualBuildStats() {
        const stats = { pre: {}, post: {} };

        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');

            const preValue = parseInt(preInput.value) || 0;
            const postValue = parseInt(postInput.value) || 0;

            if (preValue > 0) {
                stats.pre[statName] = preValue;
            }
            if (postValue > 0) {
                stats.post[statName] = postValue;
            }
        });

        return stats;
    }

    function calculateTotalPoints() {
        let totalPoints = 0;
        const attunements = ['Flamecharm', 'Frostdraw', 'Thundercall', 'Galebreathe', 'Shadowcast', 'Ironsing', 'Bloodrend'];
        let attunementCount = 0;

        // First pass: count how many attunements have points invested
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const postInput = row.querySelector('.post-shrine');
            const postValue = parseInt(postInput.value) || 0;

            if (attunements.includes(statName) && postValue > 0) {
                attunementCount++;
            }
        });

        // Second pass: calculate total points
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const postInput = row.querySelector('.post-shrine');
            const postValue = parseInt(postInput.value) || 0;

            if (attunements.includes(statName)) {
                // Add all attunement points
                totalPoints += postValue;
            } else {
                // Non-attunement stats count normally
                totalPoints += postValue;
            }
        });

        // Apply the free point rule: first attunement costs 1 point, others get first point free
        // So we add 1 for having any attunements, then subtract 1 for each attunement
        if (attunementCount > 0) {
            totalPoints = totalPoints - (attunementCount - 1);
        }

        return totalPoints;
    }

    function updateSparePoints() {
        const totalPoints = calculateTotalPoints();
        const sparePoints = MAX_TOTAL_POINTS - totalPoints;

        console.log(`Total Points Used: ${totalPoints}, Leftover Points: ${sparePoints}`);
        const sparePointsElement = document.getElementById('sparePointsValue');

        if (sparePointsElement) {
            sparePointsElement.textContent = sparePoints;
        }
    }

    // Power is derived from total invested points, not a separate investable stat.
    // Power 1 at creation (30 pts). Power 2 at 45 pts (30 + 15). Power N at 30 + (N-1)*15 pts.
    // Formula: 1 + floor((pts - 30) / 15), clamped 1–20.
    function calculateCurrentPower() {
        const totalPoints = calculateTotalPoints();
        if (totalPoints < 30) return 1;
        return Math.min(20, Math.floor((totalPoints - 30) / 15) + 1);
    }

    // Compute power from an arbitrary set of stat totals (used for pre-shrine classification)
    function getPowerFromStatTotal(statsObj) {
        const attunements = ['Flamecharm', 'Frostdraw', 'Thundercall', 'Galebreathe', 'Shadowcast', 'Ironsing', 'Bloodrend'];
        let total = 0;
        let attunementCount = 0;
        for (const [stat, val] of Object.entries(statsObj)) {
            const v = val || 0;
            if (attunements.includes(stat) && v > 0) attunementCount++;
            total += v;
        }
        if (attunementCount > 0) total -= (attunementCount - 1);
        if (total < 30) return 1;
        return Math.min(20, Math.floor((total - 30) / 15) + 1);
    }

    // Collect pre and post stats separately from the build tab
    function collectPrePostStats() {
        const pre = {};
        const post = {};
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const preVal = parseInt(row.querySelector('.pre-shrine').value) || 0;
            const postVal = parseInt(row.querySelector('.post-shrine').value) || 0;
            pre[statName] = preVal;
            post[statName] = postVal;
        });
        return { pre, post };
    }

    function getCurrentMaxBuildStats() {
        const stats = {};
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');

            const preValue = parseInt(preInput.value) || 0;
            const postValue = parseInt(postInput.value) || 0;

            // Use the maximum of the two values for the talent check
            stats[statName] = Math.max(preValue, postValue);
        });
        return stats;
    }





    // ==========================================
    // BUILD OPTIMIZER TAB
    // ==========================================

    const calculateButton = document.getElementById('calculateButton');
    const addButtons = document.querySelectorAll('#optimizer-tab .add-input-btn');


    const setupInputValidation = (input) => {
        input.addEventListener('blur', () => {
            handleInputValidation(input);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleInputValidation(input);
                input.blur();
            }
        });

        input.addEventListener('keypress', (e) => {
            if (!/[0-9]/.test(e.key) &&
                e.key !== 'Backspace' &&
                e.key !== 'Delete' &&
                e.key !== 'ArrowLeft' &&
                e.key !== 'ArrowRight' &&
                e.key !== 'Tab') {
                e.preventDefault();
            }
        });
    };

    // Apply validation to all existing optimizer inputs
    document.querySelectorAll('#optimizer-tab input[type="number"]').forEach(input => {
        setupInputValidation(input);
    });

    function isOathTalent(talent) {
        return talent.rarity === 'Oath' && talent.name.startsWith('Oath:');
    }

    function getCurrentOath() {
        for (const talentId of selectedTalents) {
            const talent = allTalents.find(t => t.id === talentId);
            if (talent && isOathTalent(talent) && talent.rarity === 'Oath') {
                return talent;
            }
        }
        return null;
    }

    function getTalentsDependingOnOath(oathTalent) {
        const dependentTalents = [];

        for (const talentId of selectedTalents) {
            const talent = allTalents.find(t => t.id === talentId);
            if (!talent || talent.id === oathTalent.id) continue;

            const requiredNames = getRequiredTalentNames(talent);
            if (requiredNames.includes(oathTalent.name)) {
                dependentTalents.push(talent);
            }
        }

        return dependentTalents;
    }


    function showOathSwapModal(currentOath, newOath) {
        const modal = document.getElementById('oathSwapModal');
        const messageEl = document.getElementById('oathSwapMessage');
        const comparisonContainer = document.getElementById('oathComparisonCards');

        // Store the oaths for later use
        window.pendingOathSwap = {
            current: currentOath,
            new: newOath
        };

        // Get talents that depend on current oath
        const dependentTalents = getTalentsDependingOnOath(currentOath);

        if (dependentTalents.length > 0) {
            messageEl.innerHTML = `
            <p>You already have <strong>${currentOath.name}</strong>. Switching to <strong>${newOath.name}</strong> will also remove the following talents:</p>
            <div style="background-color: rgba(220, 20, 60, 0.2); border-left: 3px solid #dc143c; padding: 10px; margin: 10px 0;">
                ${dependentTalents.map(t => `<div>• ${t.name}</div>`).join('')}
            </div>
        `;
        } else {
            messageEl.innerHTML = `
            <p>You already have <strong>${currentOath.name}</strong>. Do you want to switch to <strong>${newOath.name}</strong>?</p>
        `;
        }

        // Build comparison cards
        comparisonContainer.innerHTML = '';

        // Current oath card
        const currentCard = document.createElement('div');
        currentCard.className = 'weapon-comparison-card';
        currentCard.innerHTML = `
        <h3>Current Oath</h3>
        ${createOathComparisonHTML(currentOath, dependentTalents)}
    `;
        comparisonContainer.appendChild(currentCard);

        // New oath card
        const newCard = document.createElement('div');
        newCard.className = 'weapon-comparison-card';
        newCard.innerHTML = `
        <h3>New Oath</h3>
        ${createOathComparisonHTML(newOath, [])}
    `;
        comparisonContainer.appendChild(newCard);

        modal.classList.add('active');
    }

    function createOathComparisonHTML(oath, dependentTalents) {
        const requirements = getTalentRequirements(oath);

        let html = `
        <div style="margin-bottom: 12px;">
            <strong style="font-size: 1.1em;">${oath.name}</strong>
        </div>
        <div style="margin-bottom: 12px; color: var(--card-text-secondary); font-size: 0.9em;">
            ${oath.desc || 'No description available'}
        </div>
    `;

        if (requirements.length > 0) {
            const displayRequirements = requirements.filter(r => !r.isPower);
            if (displayRequirements.length > 0) {
                html += `
                <div style="border-top: 1px solid var(--splitter-color); padding-top: 8px; margin-top: 8px;">
                    <span style="color: var(--card-text-secondary); font-size: 0.85em; display: block; margin-bottom: 6px;">Requirements:</span>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${displayRequirements.map(req =>
                    `<span class="req-badge">${req.stat}: ${req.value}</span>`
                ).join('')}
                    </div>
                </div>
            `;
            }
        }

        if (dependentTalents.length > 0) {
            html += `
            <div style="border-top: 1px solid var(--splitter-color); padding-top: 8px; margin-top: 8px;">
                <span style="color: var(--card-text-secondary); font-size: 0.85em; display: block; margin-bottom: 6px;">Unlocked Talents:</span>
                <div style="color: var(--card-text-primary); font-size: 0.9em;">
                    ${dependentTalents.map(t => `<div>• ${t.name}</div>`).join('')}
                </div>
            </div>
        `;
        }

        return html;
    }

    const handleConditionChange = (event) => {
        const select = event.target;
        const inputGroup = select.closest('.input-group');

        // Find the input that corresponds to this select
        // Look backwards from the select to find the nearest input[type="number"] that's not a while-value-input
        let inputElement = select.previousElementSibling;
        while (inputElement && (inputElement.tagName !== 'INPUT' || inputElement.classList.contains('while-value-input'))) {
            inputElement = inputElement.previousElementSibling;
        }

        if (inputElement && inputElement.tagName === 'INPUT') {
            inputElement.setAttribute('data-condition', select.value);
        }

        // Find the container for this specific condition (input + select + optional while-controls)
        // We need to look for while-controls that are siblings of this select
        let whileControls = select.nextElementSibling;
        while (whileControls && !whileControls.classList.contains('while-controls') &&
            !whileControls.classList.contains('condition-select') &&
            !whileControls.tagName === 'INPUT') {
            whileControls = whileControls.nextElementSibling;
        }

        // If we found while-controls as the next sibling, that's the one for this select
        if (whileControls && whileControls.classList.contains('while-controls')) {
            // This select already has while-controls
            if (select.value !== 'while') {
                whileControls.remove();
            }
        } else if (select.value === 'while') {
            // Get the current stat name from the stat-row
            const statRow = select.closest('.stat-row');
            const currentStat = statRow.getAttribute('data-stat');

            // Need to create while controls
            whileControls = document.createElement('div');
            whileControls.className = 'while-controls';

            const statSelect = document.createElement('select');
            statSelect.className = 'while-stat-select';

            // Create options array, excluding the current stat
            const allStats = [
                'Strength', 'Fortitude', 'Agility', 'Intelligence', 'Willpower', 'Charisma',
                'Heavy Wep.', 'Medium Wep.', 'Light Wep.',
                'Flamecharm', 'Frostdraw', 'Thundercall', 'Galebreathe', 'Shadowcast', 'Ironsing', 'Bloodrend'
            ];

            const optionsHTML = allStats
                .filter(stat => stat !== currentStat)
                .map(stat => `<option value="${stat}">${stat}</option>`)
                .join('');

            statSelect.innerHTML = optionsHTML;

            const valueInput = document.createElement('input');
            valueInput.type = 'number';
            valueInput.className = 'while-value-input';
            valueInput.value = '0';
            valueInput.placeholder = 'Value';
            setupInputValidation(valueInput);

            whileControls.appendChild(statSelect);
            whileControls.appendChild(valueInput);

            // Insert after the select (or after the remove button if it exists)
            let insertAfter = select.nextElementSibling;
            if (insertAfter && insertAfter.classList.contains('remove-input-btn')) {
                // Insert after the remove button
                if (insertAfter.nextElementSibling) {
                    inputGroup.insertBefore(whileControls, insertAfter.nextElementSibling);
                } else {
                    inputGroup.appendChild(whileControls);
                }
            } else {
                // Insert right after the select
                if (insertAfter) {
                    inputGroup.insertBefore(whileControls, insertAfter);
                } else {
                    inputGroup.appendChild(whileControls);
                }
            }
        }
    };

    document.querySelectorAll('#optimizer-tab .condition-select').forEach(select => {
        select.addEventListener('change', handleConditionChange);
    });

    addButtons.forEach(button => {
        button.addEventListener('click', () => {
            const statRow = button.closest('.stat-row');
            const inputGroup = statRow.querySelector('.input-group');
            const currentInputs = inputGroup.querySelectorAll('input[type="number"]').length;

            // Only count the main stat inputs, not while-condition inputs
            const mainInputs = Array.from(inputGroup.querySelectorAll('input[type="number"]')).filter(input =>
                !input.classList.contains('while-value-input')
            );

            if (mainInputs.length < 2) {
                const newInput = document.createElement('input');
                newInput.type = 'number';
                newInput.value = '0';
                newInput.classList.add('dynamic-input');
                newInput.setAttribute('data-condition', 'any');
                setupInputValidation(newInput);

                const newSelect = document.createElement('select');
                newSelect.classList.add('condition-select');
                newSelect.innerHTML = `
                <option value="any">Any</option>
                <option value="pre">Pre-Shrine</option>
                <option value="post">Post-Shrine</option>
                <option value="while">While</option>
            `;
                newSelect.addEventListener('change', handleConditionChange);

                const removeButton = document.createElement('button');
                removeButton.textContent = '-';
                removeButton.classList.add('remove-input-btn');

                inputGroup.appendChild(newInput);
                inputGroup.appendChild(newSelect);
                inputGroup.appendChild(removeButton);

                removeButton.addEventListener('click', () => {
                    newInput.remove();
                    newSelect.remove();
                    removeButton.remove();

                    // Re-check the count after removal
                    const remainingMainInputs = Array.from(inputGroup.querySelectorAll('input[type="number"]')).filter(input =>
                        !input.classList.contains('while-value-input')
                    );
                    if (remainingMainInputs.length < 2) {
                        button.style.display = '';
                    }
                });
            }

            // Re-count after adding
            const totalMainInputs = Array.from(inputGroup.querySelectorAll('input[type="number"]')).filter(input =>
                !input.classList.contains('while-value-input')
            );
            if (totalMainInputs.length >= 2) {
                button.style.display = 'none';
            }
        });
    });

    // --- Calculation Logic ---

    function collectDesiredStats() {
        const desiredStats = {};

        document.querySelectorAll('#optimizer-tab .stat-row[data-stat]').forEach(statRow => {
            const statName = statRow.getAttribute('data-stat');
            desiredStats[statName] = [];

            statRow.querySelectorAll('.input-group').forEach(inputGroup => {
                const input = inputGroup.querySelector('input[type="number"]');
                const value = parseInt(input.value) || 0;
                const condition = input.getAttribute('data-condition') || 'any';

                if (value > 0) {
                    const requirement = { value: value, condition: condition };

                    // If condition is "while", add the while stat and value
                    if (condition === 'while') {
                        const whileControls = inputGroup.querySelector('.while-controls');
                        if (whileControls) {
                            const whileStat = whileControls.querySelector('.while-stat-select').value;
                            const whileValue = parseInt(whileControls.querySelector('.while-value-input').value) || 0;
                            requirement.whileStat = whileStat;
                            requirement.whileValue = whileValue;
                        }
                    }

                    desiredStats[statName].push(requirement);
                }
            });
        });
        return desiredStats;
    }

    function calculateOptimalOrder(desiredStats) {

        console.log('=== DEBUG: Input to calculateOptimalOrder ===');
        for (const [statName, requirements] of Object.entries(desiredStats)) {
            if (requirements.length > 0) {
                console.log(`${statName}:`, requirements);
            }
        }
        console.log('===========================================');

        const attunementStats = ['Flamecharm', 'Frostdraw', 'Thundercall', 'Galebreathe', 'Shadowcast', 'Ironsing', 'Bloodrend'];

        const derivedStatMapping = {
            'Body': ['Strength', 'Fortitude', 'Agility'],
            'Mind': ['Intelligence', 'Willpower', 'Charisma']
        };

        const statRequirements = {};

        // Initialize the choices array if it doesn't exist
        if (!window.pendingDerivedStatChoices) {
            window.pendingDerivedStatChoices = [];
        } else {
            // Clear it for this calculation
            window.pendingDerivedStatChoices = [];
        }

        // Track if we need user input
        let needsUserInput = false;

        for (const [statName, requirements] of Object.entries(desiredStats)) {
            if (requirements.length === 0) continue;

            // Handle derived stats (Body/Mind) - but this won't trigger for pre-resolved stats
            if (derivedStatMapping[statName]) {
                const componentStats = derivedStatMapping[statName];

                for (const req of requirements) {
                    let chosenStat;

                    // Check if user has already made a selection
                    if (window.selectedDerivedStats && window.selectedDerivedStats[statName]) {
                        chosenStat = window.selectedDerivedStats[statName];
                        console.log(`Using user-selected stat for ${statName}: ${chosenStat}`);
                    } else {
                        // Find the cheapest option (highest current value)
                        const currentBuild = getCurrentMaxBuildStats();
                        let bestStat = componentStats[0];
                        let bestCurrentValue = currentBuild[bestStat] || 0;

                        for (const compStat of componentStats) {
                            const currentValue = currentBuild[compStat] || 0;
                            if (currentValue > bestCurrentValue) {
                                bestCurrentValue = currentValue;
                                bestStat = compStat;
                            }
                        }

                        // If all are 0, need user input
                        if (bestCurrentValue === 0) {
                            console.log(`Need user input for ${statName}`);

                            // Only add if not already in choices
                            const alreadyHasChoice = window.pendingDerivedStatChoices.some(
                                c => c.derivedStat === statName && c.value === req.value
                            );

                            if (!alreadyHasChoice) {
                                window.pendingDerivedStatChoices.push({
                                    derivedStat: statName,
                                    value: req.value,
                                    condition: req.condition,
                                    options: componentStats
                                });
                            }

                            needsUserInput = true;
                            chosenStat = componentStats[0]; // Temporary default
                        } else {
                            chosenStat = bestStat;
                            console.log(`Auto-selected ${chosenStat} for ${statName} (current value: ${bestCurrentValue})`);
                        }
                    }

                    // Add requirement for chosen stat
                    if (!statRequirements[chosenStat]) {
                        statRequirements[chosenStat] = {
                            isAttunement: false,
                            requirements: [],
                            minPre: 0,
                            minPost: 0,
                            hasAny: false,
                            whileConditions: []
                        };
                    }

                    // Transfer requirement
                    if (req.condition === 'any') {
                        statRequirements[chosenStat].hasAny = true;
                        statRequirements[chosenStat].requirements.push(req);
                    } else if (req.condition === 'pre') {
                        statRequirements[chosenStat].minPre = Math.max(statRequirements[chosenStat].minPre, req.value);
                    } else if (req.condition === 'post') {
                        statRequirements[chosenStat].minPost = Math.max(statRequirements[chosenStat].minPost, req.value);
                    } else if (req.condition === 'while') {
                        statRequirements[chosenStat].whileConditions.push(req);
                    }
                }
                continue;
            }

            // Original handling for non-derived stats
            if (!statRequirements[statName]) {
                statRequirements[statName] = {
                    isAttunement: attunementStats.includes(statName),
                    requirements: [],
                    minPre: 0,
                    minPost: 0,
                    hasAny: false,
                    whileConditions: []
                };
            }

            // Add these requirements to existing ones
            statRequirements[statName].requirements.push(...requirements);

            for (const req of requirements) {
                if (req.condition === 'pre') {
                    statRequirements[statName].minPre = Math.max(statRequirements[statName].minPre, req.value);
                } else if (req.condition === 'post') {
                    statRequirements[statName].minPost = Math.max(statRequirements[statName].minPost, req.value);
                } else if (req.condition === 'any') {
                    statRequirements[statName].hasAny = true;
                } else if (req.condition === 'while') {
                    statRequirements[statName].whileConditions.push(req);
                }
            }
        }

        // If we need user input and haven't gotten it yet, return null
        if (needsUserInput && (!window.selectedDerivedStats || Object.keys(window.selectedDerivedStats).length === 0)) {
            console.log('Returning null - need user input for:', window.pendingDerivedStatChoices);
            return null;
        }

        // Continue with the rest of the function (existing combination generation code)
        function generateCombinations(statReqs) {
            const statsWithAny = [];
            const baseConfig = {};
            const whileGroups = {}; // Track which stats belong to the same talent group

            for (const [statName, data] of Object.entries(statReqs)) {
                baseConfig[statName] = {
                    isAttunement: data.isAttunement,
                    minPre: data.minPre,
                    minPost: data.minPost,
                    anyRequirements: [],
                    whileConditions: []
                };

                if (data.hasAny) {
                    const anyReqs = data.requirements.filter(r => r.condition === 'any');
                    baseConfig[statName].anyRequirements = anyReqs;
                    statsWithAny.push(statName);
                }

                if (data.whileConditions && data.whileConditions.length > 0) {
                    baseConfig[statName].whileConditions = data.whileConditions;

                    // Group while-conditions by talent
                    data.whileConditions.forEach(cond => {
                        if (cond.whileStat && cond.whileValue) {
                            // Create a unique group ID for this while relationship
                            const groupId = `while_${statName}_${cond.whileStat}`;

                            if (!whileGroups[groupId]) {
                                whileGroups[groupId] = [];
                            }

                            whileGroups[groupId].push({
                                stat: statName,
                                value: cond.value,
                                whileStat: cond.whileStat,
                                whileValue: cond.whileValue
                            });
                        } else if (cond.talentGroup) {
                            if (!whileGroups[cond.talentGroup]) {
                                whileGroups[cond.talentGroup] = [];
                            }
                            whileGroups[cond.talentGroup].push({
                                stat: statName,
                                value: cond.value,
                                allRequirements: cond.allRequirements
                            });
                        }
                    });
                }
            }

            // Generate all combinations of pre/post for 'any' requirements
            const combinations = [];
            const totalAnyRequirements = statsWithAny.reduce((sum, statName) =>
                sum + baseConfig[statName].anyRequirements.length, 0);

            const totalCombinations = Math.pow(2, totalAnyRequirements);

            for (let i = 0; i < totalCombinations; i++) {
                const config = JSON.parse(JSON.stringify(baseConfig));
                let bitIndex = 0;

                for (const statName of statsWithAny) {
                    for (const anyReq of config[statName].anyRequirements) {
                        const isPre = (i >> bitIndex) & 1;
                        bitIndex++;

                        if (isPre) {
                            config[statName].minPre = Math.max(config[statName].minPre, anyReq.value);
                        } else {
                            config[statName].minPost = Math.max(config[statName].minPost, anyReq.value);
                        }
                    }
                }

                // Now handle 'while' conditions - generate pre/post variants
                const whileVariants = [];

                if (Object.keys(whileGroups).length > 0) {
                    const groupKeys = Object.keys(whileGroups);

                    // NEW: Check which groups have forced placement due to explicit pre/post requirements
                    const forcedPlacements = {};

                    groupKeys.forEach(groupKey => {
                        const group = whileGroups[groupKey];
                        let forcedPre = false;
                        let forcedPost = false;

                        // Check all stats involved in this while condition
                        group.forEach(item => {
                            // Check the main stat
                            if (config[item.stat].minPre > 0 && config[item.stat].minPost === 0) {
                                forcedPre = true;
                            }
                            if (config[item.stat].minPost > 0 && config[item.stat].minPre === 0) {
                                forcedPost = true;
                            }

                            // NEW: Check the "while" stat (the stat this depends on)
                            if (item.whileStat) {
                                if (config[item.whileStat]) {
                                    if (config[item.whileStat].minPre > 0 && config[item.whileStat].minPost === 0) {
                                        forcedPre = true;
                                    }
                                    if (config[item.whileStat].minPost > 0 && config[item.whileStat].minPre === 0) {
                                        forcedPost = true;
                                    }
                                }
                            }

                            // Check other stats in allRequirements
                            if (item.allRequirements) {
                                item.allRequirements.forEach(req => {
                                    if (config[req.stat]) {
                                        if (config[req.stat].minPre > 0 && config[req.stat].minPost === 0) {
                                            forcedPre = true;
                                        }
                                        if (config[req.stat].minPost > 0 && config[req.stat].minPre === 0) {
                                            forcedPost = true;
                                        }
                                    }
                                });
                            }
                        });

                        if (forcedPre && forcedPost) {
                            console.warn(`Conflict in while group ${groupKey}: some stats require pre, others require post`);
                        }

                        if (forcedPre) {
                            forcedPlacements[groupKey] = 'pre';
                            console.log(`While group ${groupKey} forced to PRE-SHRINE`);
                        } else if (forcedPost) {
                            forcedPlacements[groupKey] = 'post';
                            console.log(`While group ${groupKey} forced to POST-SHRINE`);
                        }
                    });

                    // Only generate combinations for groups without forced placement
                    const flexibleGroups = groupKeys.filter(key => !forcedPlacements[key]);
                    const totalWhileCombinations = Math.pow(2, flexibleGroups.length);

                    for (let j = 0; j < totalWhileCombinations; j++) {
                        const whileConfig = JSON.parse(JSON.stringify(config));

                        // Apply forced placements first
                        Object.entries(forcedPlacements).forEach(([groupKey, placement]) => {
                            const group = whileGroups[groupKey];

                            group.forEach(item => {
                                if (placement === 'pre') {
                                    // For while conditions, use the while value (not the target value)
                                    // This ensures both stats reach their "while" values together
                                    const preValue = item.whileStat && item.whileValue
                                        ? item.whileValue  // Use the while condition value
                                        : item.value;       // Fallback to full value if no specific while value

                                    whileConfig[item.stat].minPre = Math.max(
                                        whileConfig[item.stat].minPre,
                                        preValue
                                    );

                                    // Also ensure the "while" stat is set to pre
                                    if (item.whileStat) {
                                        if (!whileConfig[item.whileStat]) {
                                            whileConfig[item.whileStat] = {
                                                isAttunement: false,
                                                minPre: 0,
                                                minPost: 0,
                                                anyRequirements: [],
                                                whileConditions: []
                                            };
                                        }
                                        whileConfig[item.whileStat].minPre = Math.max(
                                            whileConfig[item.whileStat].minPre,
                                            item.whileValue || 0
                                        );
                                    }
                                } else {
                                    whileConfig[item.stat].minPost = Math.max(
                                        whileConfig[item.stat].minPost,
                                        item.value
                                    );

                                    // Also ensure the "while" stat is set to post
                                    if (item.whileStat) {
                                        if (!whileConfig[item.whileStat]) {
                                            whileConfig[item.whileStat] = {
                                                isAttunement: false,
                                                minPre: 0,
                                                minPost: 0,
                                                anyRequirements: [],
                                                whileConditions: []
                                            };
                                        }
                                        whileConfig[item.whileStat].minPost = Math.max(
                                            whileConfig[item.whileStat].minPost,
                                            item.whileValue || 0
                                        );
                                    }
                                }
                            });
                        });

                        // Then apply flexible placements
                        flexibleGroups.forEach((groupKey, index) => {
                            const isPre = (j >> index) & 1;
                            const group = whileGroups[groupKey];

                            group.forEach(item => {
                                if (isPre) {
                                    // For while conditions, use the while value (not the target value)
                                    const preValue = item.whileStat && item.whileValue
                                        ? item.whileValue
                                        : item.value;

                                    whileConfig[item.stat].minPre = Math.max(
                                        whileConfig[item.stat].minPre,
                                        preValue
                                    );

                                    if (item.whileStat) {
                                        if (!whileConfig[item.whileStat]) {
                                            whileConfig[item.whileStat] = {
                                                isAttunement: false,
                                                minPre: 0,
                                                minPost: 0,
                                                anyRequirements: [],
                                                whileConditions: []
                                            };
                                        }
                                        whileConfig[item.whileStat].minPre = Math.max(
                                            whileConfig[item.whileStat].minPre,
                                            item.whileValue || 0
                                        );
                                    }
                                } else {
                                    whileConfig[item.stat].minPost = Math.max(
                                        whileConfig[item.stat].minPost,
                                        item.value
                                    );

                                    if (item.whileStat) {
                                        if (!whileConfig[item.whileStat]) {
                                            whileConfig[item.whileStat] = {
                                                isAttunement: false,
                                                minPre: 0,
                                                minPost: 0,
                                                anyRequirements: [],
                                                whileConditions: []
                                            };
                                        }
                                        whileConfig[item.whileStat].minPost = Math.max(
                                            whileConfig[item.whileStat].minPost,
                                            item.whileValue || 0
                                        );
                                    }
                                }
                            });
                        });

                        whileVariants.push(whileConfig);
                    }
                } else {
                    whileVariants.push(config);
                }

                combinations.push(...whileVariants);
            }

            return combinations.length > 0 ? combinations : [baseConfig];
        }

        const allCombinations = generateCombinations(statRequirements);

        // Generate shrine inclusion variants for post-only stats
        const allCombinationsWithShrineOptions = [];
        for (const config of allCombinations) {
            const postOnlyStats = [];
            const symmetricWhileStats = []; // NEW: Track stats that are symmetric in while conditions

            // NEW: Detect symmetric while conditions (stats that must grow together)
            const whileGroups = new Map(); // Track which stats are in which while groups

            for (const [statName, data] of Object.entries(config)) {
                // Track while condition groups
                if (data.whileConditions && data.whileConditions.length > 0) {
                    data.whileConditions.forEach(cond => {
                        if (cond.talentGroup) {
                            if (!whileGroups.has(cond.talentGroup)) {
                                whileGroups.set(cond.talentGroup, []);
                            }
                            whileGroups.get(cond.talentGroup).push(statName);
                        }
                    });
                }

                if (data.minPost > 0 && data.minPre === 0) {
                    postOnlyStats.push(statName);
                }
            }

            // NEW: Check if post-only stats are part of symmetric while conditions
            for (const postStat of postOnlyStats) {
                let isSymmetric = false;

                // Check each while group this stat is part of
                whileGroups.forEach((groupStats, groupKey) => {
                    if (groupStats.includes(postStat)) {
                        // Check if ALL stats in this group are post-only with same requirements
                        const allPostOnly = groupStats.every(s => postOnlyStats.includes(s));

                        if (allPostOnly) {
                            // Check if they all have the same value requirements
                            const values = groupStats.map(s => config[s].minPost);
                            const allSameValue = values.every(v => v === values[0]);

                            if (allSameValue) {
                                isSymmetric = true;
                                console.log(`Detected symmetric while group: ${groupStats.join(', ')} (value: ${values[0]})`);
                            }
                        }
                    }
                });

                if (isSymmetric) {
                    symmetricWhileStats.push(postStat);
                }
            }

            // Generate all combinations of including/excluding post-only stats from shrine
            // BUT exclude symmetric while stats from shrine options
            const shrineablePostStats = postOnlyStats.filter(s => !symmetricWhileStats.includes(s));

            console.log('Post-only stats:', postOnlyStats);
            console.log('Symmetric while stats (not shrineable):', symmetricWhileStats);
            console.log('Shrineable post stats:', shrineablePostStats);

            const shrineOptionCount = Math.pow(2, shrineablePostStats.length);
            for (let i = 0; i < shrineOptionCount; i++) {
                const variant = {
                    config: config,
                    shrineInclusions: {}
                };

                for (let j = 0; j < shrineablePostStats.length; j++) {
                    const includeInShrine = (i >> j) & 1;
                    variant.shrineInclusions[shrineablePostStats[j]] = includeInShrine === 1;
                }

                // Explicitly mark symmetric stats as NOT included in shrine
                for (const symmetricStat of symmetricWhileStats) {
                    variant.shrineInclusions[symmetricStat] = false;
                }

                allCombinationsWithShrineOptions.push(variant);
            }

            // If no shrineable post-only stats, just add the config as-is
            if (shrineablePostStats.length === 0) {
                const variant = {
                    config: config,
                    shrineInclusions: {}
                };

                // Explicitly mark symmetric stats as NOT included in shrine
                for (const symmetricStat of symmetricWhileStats) {
                    variant.shrineInclusions[symmetricStat] = false;
                }

                allCombinationsWithShrineOptions.push(variant);
            }
        }

        console.log(`Testing ${allCombinationsWithShrineOptions.length} combinations (including shrine inclusion variants)...`);

        let bestSolution = null;
        let bestScore = -Infinity;

        for (const variant of allCombinationsWithShrineOptions) {
            const config = variant.config;

            // Build pre-shrine allocation
            const preShrine = {};
            const statsToInclude = new Set();

            for (const [statName, data] of Object.entries(config)) {
                if (data.minPre > 0) {
                    preShrine[statName] = {
                        currentPre: data.minPre,
                        isAttunement: data.isAttunement
                    };
                    statsToInclude.add(statName);
                }

                // Check if this post-only stat should be included in shrine
                if (data.minPost > 0 && data.minPre === 0) {
                    if (variant.shrineInclusions[statName]) {
                        // Include in shrine with 1 point investment
                        preShrine[statName] = {
                            currentPre: 1,
                            isAttunement: data.isAttunement
                        };
                        statsToInclude.add(statName);
                    }
                }
            }

            // Calculate total pre-shrine investment
            let totalPreInvestment = 0;
            for (const data of Object.values(preShrine)) {
                totalPreInvestment += data.currentPre;
            }

            if (totalPreInvestment > MAX_TOTAL_POINTS) continue;

            // Simulate shrine averaging
            const shrineResult = simulateShrineAveraging(preShrine);

            // Check if post-shrine values meet requirements
            let isValid = true;
            let totalPostInvestment = 0;
            const finalStats = {};

            for (const [statName, data] of Object.entries(config)) {
                const postShrineValue = shrineResult.postShrine[statName] || 0;

                // For stats excluded from shrine, invest all points post-shrine
                if (data.minPost > 0 && data.minPre === 0 && !variant.shrineInclusions[statName]) {
                    finalStats[statName] = data.minPost;
                    totalPostInvestment += data.minPost;
                } else {
                    // For stats in shrine or with pre-shrine requirements
                    const neededPost = Math.max(0, data.minPost - postShrineValue);
                    finalStats[statName] = postShrineValue + neededPost;
                    totalPostInvestment += neededPost;
                }

                // Check validity
                if (finalStats[statName] > MAX_STAT_VALUE) {
                    isValid = false;
                    break;
                }

                // Verify pre-shrine requirement
                if (preShrine[statName] && preShrine[statName].currentPre < data.minPre) {
                    isValid = false;
                    break;
                }
            }

            const totalPoints = totalPostInvestment + totalPreInvestment;
            if (!isValid || totalPoints > MAX_TOTAL_POINTS) continue;

            // IMPROVED SCORING: Heavily favor solutions with more leftover points
            const leftoverPoints = MAX_TOTAL_POINTS - totalPoints;
            const score = (leftoverPoints * 1000) - statsToInclude.size;
            // --- FIX END ---

            if (score > bestScore) {
                bestScore = score;
                bestSolution = {
                    preShrine: preShrine,
                    postShrine: shrineResult.postShrine,
                    finalStats: finalStats,
                    totalPreInvestment: totalPreInvestment,
                    totalPostInvestment: totalPostInvestment,
                    leftoverPoints: leftoverPoints,
                    shrineLeftover: shrineResult.leftoverPoints
                };
            }
        }

        if (bestSolution) {
            console.log('--- Optimal Solution Found ---');
            console.log('Pre-Shrine Investment:', bestSolution.totalPreInvestment);
            console.table(Object.entries(bestSolution.preShrine).map(([stat, data]) => ({
                Stat: stat,
                Points: data.currentPre
            })));

            console.log('\nPost-Shrine Values (after averaging):');
            console.table(bestSolution.postShrine);
            console.log('Shrine Leftover:', bestSolution.shrineLeftover);

            console.log('\nFinal Stats:');
            console.table(bestSolution.finalStats);


            console.log(`\nTotal Points Used: ${bestSolution.totalPreInvestment + bestSolution.totalPostInvestment}`);
            console.log(`Leftover Points: ${bestSolution.leftoverPoints}`);
        } else {
            console.log('No valid solution found within constraints.');
        }

        return bestSolution;
    }

    function simulateShrineAveraging(stats) {
        const BOTTLENECK_LIMIT = 25;
        const MAX_STAT = 100;
        const attunements = ['Flamecharm', 'Frostdraw', 'Thundercall', 'Galebreathe', 'Shadowcast', 'Ironsing', 'Bloodrend'];

        // Calculate total invested and affected stats
        let totalInvested = 0;
        const affectedStats = [];
        let attunementCount = 0;

        for (const [statName, statData] of Object.entries(stats)) {
            if (statData.currentPre > 0) {
                totalInvested += statData.currentPre;
                affectedStats.push(statName);

                if (attunements.includes(statName)) {
                    attunementCount++;
                }
            }
        }

        if (affectedStats.length === 0) {
            return { totalInvested: 0, postShrine: {}, leftoverPoints: 0 };
        }

        const pointsStart = totalInvested;
        const preshrineBuild = {};
        const postShrine = {};

        // Initialize with average
        for (const statName of affectedStats) {
            preshrineBuild[statName] = stats[statName].currentPre;
            postShrine[statName] = pointsStart / affectedStats.length;
        }

        // Bottlenecking process
        let bottleneckedDivideBy = affectedStats.length;
        const bottlenecked = [];
        let bottleneckedStats = false;
        let previousStats = { ...postShrine };

        do {
            let bottleneckedPoints = 0;
            bottleneckedStats = false;

            // Check for bottlenecking in non-attunement stats only
            for (const statName of affectedStats) {
                const isAttunement = attunements.includes(statName);

                if (!isAttunement && !bottlenecked.includes(statName)) {
                    const prevStat = previousStats[statName];
                    const shrineStat = preshrineBuild[statName];
                    const currentStat = postShrine[statName];

                    if (shrineStat - currentStat > BOTTLENECK_LIMIT) {
                        postShrine[statName] = shrineStat - BOTTLENECK_LIMIT;
                        bottleneckedPoints += postShrine[statName] - prevStat;
                        bottlenecked.push(statName);
                        bottleneckedDivideBy--;
                    }
                }
            }

            // Redistribute bottlenecked points ONLY to non-bottlenecked stats
            if (bottleneckedDivideBy > 0 && bottleneckedPoints !== 0) {
                for (const statName of affectedStats) {
                    if (!bottlenecked.includes(statName)) {
                        postShrine[statName] -= bottleneckedPoints / bottleneckedDivideBy;

                        if (preshrineBuild[statName] - postShrine[statName] > BOTTLENECK_LIMIT) {
                            bottleneckedStats = true;
                        }
                    }
                }
            }

            previousStats = { ...postShrine };
        } while (bottleneckedStats);

        // Floor all stats
        for (const statName in postShrine) {
            postShrine[statName] = Math.floor(postShrine[statName]);
        }

        // Calculate spare points
        let sparePoints = pointsStart - Object.values(postShrine).reduce((a, b) => a + b, 0);

        // Distribute spare points (repeatedly, 1 point at a time)
        while (sparePoints > 0) {
            let changed = false;

            for (const statName of affectedStats) {
                if (sparePoints <= 0) break;
                if (bottlenecked.includes(statName)) continue;
                if (postShrine[statName] >= MAX_STAT) continue;

                postShrine[statName] += 1;
                sparePoints -= 1;
                changed = true;
            }

            if (!changed) break;
        }

        return {
            totalInvested: pointsStart,
            postShrine,
            leftoverPoints: sparePoints
        };
    }

    function handleCalculateClick() {
        const desiredStats = collectDesiredStats();

        console.log('--- User Desired Requirements ---');
        console.table(desiredStats);

        const solution = calculateOptimalOrder(desiredStats);

        if (solution) {
            displayResults(solution);
        } else {
            showNotification('No valid solution found within constraints. Please adjust your requirements.');
        }
    }

    function displayResults(solution) {
        window.currentSolution = solution;

        const modal = document.getElementById('resultsModal');

        // Populate summary
        document.getElementById('totalPointsUsed').textContent =
            solution.totalPreInvestment + solution.totalPostInvestment;
        document.getElementById('leftoverPoints').textContent = solution.leftoverPoints;
        document.getElementById('preInvestment').textContent = solution.totalPreInvestment;
        document.getElementById('postInvestment').textContent = solution.totalPostInvestment;

        // Populate pre-shrine build
        const preShrineBuild = document.getElementById('preShrineBuild');
        preShrineBuild.innerHTML = '';
        for (const [stat, data] of Object.entries(solution.preShrine)) {
            const statItem = document.createElement('div');
            statItem.className = 'stat-item';
            statItem.innerHTML = `
                <span class="stat-name">${stat}</span>
                <span class="stat-value">${data.currentPre}</span>
            `;
            preShrineBuild.appendChild(statItem);
        }

        const combinedStats = document.getElementById('combinedStats');
        combinedStats.innerHTML = '';

        // Show all final stats
        for (const [stat, finalValue] of Object.entries(solution.finalStats)) {
            if (finalValue === 0) continue;

            const statItem = document.createElement('div');
            statItem.className = 'stat-item';

            // Check if this stat went through shrine averaging
            if (solution.postShrine[stat] !== undefined) {
                const postValue = solution.postShrine[stat];
                const additionalInvestment = finalValue - postValue;

                if (additionalInvestment > 0) {
                    statItem.innerHTML = `
                        <span class="stat-name">${stat}</span>
                        <span class="stat-value">${postValue} → ${finalValue} <span style="font-size: 0.85em; color: var(--card-text-secondary);">(+${additionalInvestment})</span></span>
                    `;
                } else {
                    statItem.innerHTML = `
                        <span class="stat-name">${stat}</span>
                        <span class="stat-value">${finalValue}</span>
                    `;
                }
            } else {
                // Stat was excluded from shrine (invested fully post-shrine)
                statItem.innerHTML = `
                    <span class="stat-name">${stat}</span>
                    <span class="stat-value">0 → ${finalValue} <span style="font-size: 0.85em; color: var(--card-text-secondary);">(+${finalValue})</span></span>
                `;
            }

            combinedStats.appendChild(statItem);
        }

        // Show modal
        modal.classList.add('active');
    }

    function applyToBuilder(solution) {
        // Clear all inputs first
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');
            preInput.value = 0;
            postInput.value = 0;
        });

        // Apply pre-shrine values
        for (const [statName, data] of Object.entries(solution.preShrine)) {
            const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${statName}"]`);
            if (statRow) {
                const preInput = statRow.querySelector('.pre-shrine');
                preInput.value = data.currentPre;
            }
        }
        // Apply final values as post-shrine
        for (const [statName, finalValue] of Object.entries(solution.finalStats)) {
            const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${statName}"]`);
            if (statRow) {
                const postInput = statRow.querySelector('.post-shrine');

                // If stat was in shrine, post value is final value
                // If stat was excluded from shrine, post value is final value
                postInput.value = finalValue;
            }
        }

        // Switch to Build tab
        const buildTab = document.querySelector('.tab-btn[data-tab="stats"]');
        const statsTabContent = document.getElementById('stats-tab');

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        buildTab.classList.add('active');
        statsTabContent.classList.add('active');

        // Close modal
        document.getElementById('resultsModal').classList.remove('active');

        // Show success message
        alert('Build applied successfully!');
    }

    // Attach event listener to Apply to Builder button
    document.getElementById('applyToBuilderBtn').addEventListener('click', () => {
        console.log(window.currentSolution)
        if (window.currentSolution) {
            console.log("solution")
            applyToBuilder(window.currentSolution);
        }
    });

    // Close modal functionality
    const modal = document.getElementById('resultsModal');
    const closeBtn = modal.querySelector('.close-btn');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // --- Attach Calculate Listener ---
    calculateButton.addEventListener('click', handleCalculateClick);

    // ==========================================
    // TALENTS TAB
    // ==========================================

    let allTalents = [];
    let allWeapons = [];
    let selectedTalents = new Set();
    let availableFilters = new Set();
    let selectedFilters = new Set();

    // Rarity toggle states
    let showOriginTalents = true;
    let showQuestTalents = true;
    let showOathTalents = true;
    let showEquipmentTalents = true;
    let showOutfitTalents = true;

    // Sort settings
    let availableSortBy = 'points';
    let availableSortOrder = 'desc';
    let selectedSortBy = 'points';
    let selectedSortOrder = 'desc';


    let weaponFilters = new Set();
    let weaponSortBy = 'scaledDamage';
    let weaponSortOrder = 'desc';

    let pendingTalentSelection = null;
    let pendingOptimalBuild = null;

    let equippedWeapons = [];
    let pendingWeaponSelection = null;
    let pendingWeaponOptimalBuild = null;

    let allOaths = [];

    let analysisFilters = new Set();
    let analysisData = null;


    // Fetch talents data
    async function loadTalents() {
        try {
            const response = await fetch('./proxy.json');
            const data = await response.json();

            const talentsData = data.talents || {};

            // List of talent IDs to hide
            const hiddenTalents = ['thank you'];

            // Convert object to array and filter out invalid entries and hidden talents
            // Note: We are now using 'talentsData' here instead of 'data'
            allTalents = Object.entries(talentsData)
                .filter(([key, talent]) => talent && talent.name && !hiddenTalents.includes(key.toLowerCase()))
                .map(([key, talent]) => ({
                    id: key,
                    ...talent
                }));

            console.log(`Loaded ${allTalents.length} talents`);
            renderAvailableTalents();
        } catch (error) {
            console.error('Error loading talents:', error);
            document.getElementById('availableTalents').innerHTML =
                '<p class="empty-message">Error loading talents. Please check console.</p>';
        }
    }

    async function loadWeapons() {
        try {
            const response = await fetch('./proxy.json');
            const data = await response.json();

            const weaponsData = data.weapons || {};

            allWeapons = Object.entries(weaponsData)
                .filter(([key, weapon]) => weapon && weapon.name)
                .map(([key, weapon]) => ({
                    id: key,
                    ...weapon
                }));

            console.log(`Loaded ${allWeapons.length} weapons`);
            renderAvailableWeapons();
        } catch (error) {
            console.error('Error loading weapons:', error);
            document.getElementById('availableWeapons').innerHTML =
                '<p class="empty-message">Error loading weapons. Please check console.</p>';
        }
    }

    async function loadTalentCategories() {
        try {
            const response = await fetch('./proxy.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.categories) {
                talentCategories = data.categories;
                console.log(`Loaded ${Object.keys(talentCategories).length} talent categories`);
            } else {
                console.warn('No categories found in data');
            }
        } catch (error) {
            console.error('Error loading talent categories:', error);
            talentCategories = {}; // Set empty object as fallback
        }
    }

    // Find which category a talent belongs to
    function findTalentCategory(talentName) {
        for (const [categoryId, categoryData] of Object.entries(talentCategories)) {
            if (categoryData.talents && categoryData.talents.includes(talentName)) {
                return categoryData.name;
            }
        }
        return 'Uncategorized';
    }

    function analyzeMissingTalents(builderData) {
        try {
            let data;

            // Check if input is a string
            if (typeof builderData === 'string') {
                const trimmedInput = builderData.trim();

                // Try to detect format
                if (trimmedInput.startsWith('{')) {
                    // Looks like JSON
                    data = JSON.parse(trimmedInput);
                } else if (trimmedInput.includes('== TALENTS ==')) {
                    // Looks like text character sheet
                    data = parseTextCharacterSheet(trimmedInput);
                } else {
                    showNotification('Unrecognized format. Please paste either JSON data or a character sheet.', 'error');
                    return;
                }
            } else {
                data = builderData;
            }

            if (!data.talents || !Array.isArray(data.talents)) {
                showNotification('Invalid data: No talents array found', 'error');
                return;
            }

            // Get imported talents (from character sheet or JSON)
            // NORMALIZE the names by removing weapon type suffixes
            const importedTalentNames = new Set(
                data.talents.map(name => normalizeTalentName(name))
            );

            // Get currently selected talents in the builder
            // FILTER OUT talents with dontCountTowardsTotal
            const builderTalentNames = new Set(
                Array.from(selectedTalents)
                    .map(id => allTalents.find(t => t.id === id))
                    .filter(t => t && !t.dontCountTowardsTotal)
                    .map(t => normalizeTalentName(t.name)) // NORMALIZE here too
            );

            const extraTalents = [];
            importedTalentNames.forEach(normalizedName => {
                if (!builderTalentNames.has(normalizedName)) {
                    // Find talent by normalized name
                    const talent = allTalents.find(t => normalizeTalentName(t.name) === normalizedName);

                    if (talent) {
                        // SKIP if talent has dontCountTowardsTotal
                        if (talent.dontCountTowardsTotal) {
                            return;
                        }

                        extraTalents.push({
                            name: talent.name, // Use the actual talent name from database
                            talent: talent,
                            category: findTalentCategory(talent.name),
                            countsTowardTotal: true
                        });
                    } else {
                        // Talent not found in database
                        extraTalents.push({
                            name: normalizedName, // Use normalized name for display
                            talent: null,
                            category: 'Not Found in Database',
                            countsTowardTotal: true
                        });
                    }
                }
            });

            const missingTalents = [];
            builderTalentNames.forEach(normalizedName => {
                if (!importedTalentNames.has(normalizedName)) {
                    // Find talent by normalized name
                    const talent = allTalents.find(t => normalizeTalentName(t.name) === normalizedName);

                    if (talent) {
                        // Double-check it doesn't have dontCountTowardsTotal
                        if (talent.dontCountTowardsTotal) {
                            return;
                        }

                        missingTalents.push({
                            name: talent.name, // Use the actual talent name from database
                            talent: talent,
                            category: findTalentCategory(talent.name),
                            countsTowardTotal: true
                        });
                    }
                }
            });

            // Sort by name
            missingTalents.sort((a, b) => a.name.localeCompare(b.name));
            extraTalents.sort((a, b) => a.name.localeCompare(b.name));

            // Store data for filtering
            analysisData = {
                importedCount: importedTalentNames.size,
                builderCount: builderTalentNames.size,
                missing: missingTalents,
                extra: extraTalents
            };

            // Display results
            displayTalentAnalysis(analysisData);

        } catch (error) {
            console.error('Error analyzing talents:', error);
            showNotification(`Error: ${error.message}`, 'error');
        }
    }

    function displayTalentAnalysis(analysis) {
        // Get current build stats
        const currentStats = getCurrentMaxBuildStats();
        const preStats = collectManualBuildStats().pre;

        // Helper function to check if talent matches filters
        const matchesFilters = (item) => {
            if (!item.talent) return true; // Always show talents not in database

            const requirements = getTalentRequirements(item.talent);

            // Check availability filters
            if (analysisFilters.has('pre-available')) {
                const availablePre = requirements.every(req => {
                    if (req.isPower || req.stat === 'Power') return true;
                    if (req.stat === 'Body' || req.stat === 'Mind') {
                        const derivedStats = calculateBodyAndMind(preStats);
                        return derivedStats[req.stat] >= req.value;
                    }
                    return (preStats[req.stat] || 0) >= req.value;
                });
                if (!availablePre) return false;
            }

            if (analysisFilters.has('post-available')) {
                const availablePost = requirements.every(req => {
                    if (req.isPower || req.stat === 'Power') return true;
                    if (req.stat === 'Body' || req.stat === 'Mind') {
                        const derivedStats = calculateBodyAndMind(currentStats);
                        return derivedStats[req.stat] >= req.value;
                    }
                    return (currentStats[req.stat] || 0) >= req.value;
                });
                if (!availablePost) return false;
            }

            if (analysisFilters.has('unavailable')) {
                const isAvailable = requirements.every(req => {
                    if (req.isPower || req.stat === 'Power') return true;
                    if (req.stat === 'Body' || req.stat === 'Mind') {
                        const derivedStats = calculateBodyAndMind(currentStats);
                        return derivedStats[req.stat] >= req.value;
                    }
                    return (currentStats[req.stat] || 0) >= req.value;
                });
                if (isAvailable) return false;
            }

            // Check stat filters
            const statFilters = new Set([...analysisFilters].filter(f =>
                !['pre-available', 'post-available', 'unavailable'].includes(f)
            ));

            if (statFilters.size > 0) {
                const talentStats = new Set(requirements.map(req => req.stat));
                for (const filter of statFilters) {
                    if (!talentStats.has(filter)) {
                        return false;
                    }
                }
            }

            return true;
        };

        // Filter the talents
        const filteredMissing = analysis.missing.filter(matchesFilters);
        const filteredExtra = analysis.extra.filter(matchesFilters);

        // Update summary
        document.getElementById('builderTalentCount').textContent = analysis.builderCount;
        document.getElementById('currentTalentCount').textContent = analysis.importedCount;
        document.getElementById('missingTalentCount').textContent = filteredMissing.length;
        document.getElementById('unneededTalentCount').textContent = filteredExtra.length;

        // Display missing talents
        const missingContainer = document.getElementById('missingTalentsList');
        missingContainer.innerHTML = '';

        if (filteredMissing.length === 0) {
            missingContainer.innerHTML = '<p style="color: var(--card-text-secondary); font-style: italic; padding: 10px;">No talents match your filters.</p>';
        } else {
            const talentList = document.createElement('div');
            talentList.style.cssText = 'display: flex; flex-direction: column; gap: 6px; padding: 12px;';

            filteredMissing.forEach(item => {
                const talentDiv = document.createElement('div');
                talentDiv.style.cssText = 'padding: 8px; background-color: rgba(255, 255, 255, 0.1); border: 1px solid var(--border-color); cursor: pointer; transition: background-color 0.2s;';

                if (item.talent) {
                    const requirements = getTalentRequirements(item.talent);
                    const reqText = requirements.length > 0
                        ? requirements.filter(r => !r.isPower).map(r => `${r.stat}: ${r.value}`).join(', ')
                        : 'No requirements';


                    // Check availability
                    const availablePre = requirements.every(req => {
                        if (req.isPower || req.stat === 'Power') return true;
                        if (req.stat === 'Body' || req.stat === 'Mind') {
                            const derivedStats = calculateBodyAndMind(preStats);
                            return derivedStats[req.stat] >= req.value;
                        }
                        return (preStats[req.stat] || 0) >= req.value;
                    });

                    const availablePost = requirements.every(req => {
                        if (req.isPower || req.stat === 'Power') return true;
                        if (req.stat === 'Body' || req.stat === 'Mind') {
                            const derivedStats = calculateBodyAndMind(currentStats);
                            return derivedStats[req.stat] >= req.value;
                        }
                        return (currentStats[req.stat] || 0) >= req.value;
                    });

                    let availabilityLabel = '';
                    if (availablePre) {
                        availabilityLabel = '<span style="color: #00ff00; font-size: 0.85em;">[Pre-Available]</span>';
                    } else if (availablePost) {
                        availabilityLabel = '<span style="color: #90ee90; font-size: 0.85em;">[Post-Available]</span>';
                    } else {
                        availabilityLabel = '<span style="color: #dc143c; font-size: 0.85em;">[Unavailable]</span>';
                    }

                    talentDiv.innerHTML = `
                    <div style="font-weight: bold; color: var(--card-text-primary);">${item.name} <span style="color: var(--card-text-secondary); font-weight: normal;">(${item.category})</span></div>
                    <div style="font-size: 0.85em; color: var(--card-text-secondary); margin-top: 4px;">${reqText}</div>
                `;

                    talentDiv.addEventListener('mouseenter', () => {
                        talentDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    });
                    talentDiv.addEventListener('mouseleave', () => {
                        talentDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    });
                    talentDiv.addEventListener('click', () => {
                        document.getElementById('missingTalentsModal').classList.remove('active');
                        selectTalent(item.talent.id);
                    });
                } else {
                    talentDiv.innerHTML = `
                    <div style="font-weight: bold; color: #dc143c;">${item.name} <span style="color: var(--card-text-secondary); font-weight: normal;">(${item.category})</span></div>
                    <div style="font-size: 0.85em; color: var(--card-text-secondary); margin-top: 4px;">Not found in database</div>
                `;
                    talentDiv.style.cursor = 'default';
                }

                talentList.appendChild(talentDiv);
            });

            missingContainer.appendChild(talentList);
        }

        // Display extra talents (similar structure)
        const extraContainer = document.getElementById('unneededTalentsList');
        extraContainer.innerHTML = '';

        if (filteredExtra.length === 0) {
            extraContainer.innerHTML = '<p style="color: var(--card-text-secondary); font-style: italic; padding: 10px;">No talents match your filters.</p>';
        } else {
            const talentList = document.createElement('div');
            talentList.style.cssText = 'display: flex; flex-direction: column; gap: 6px; padding: 12px;';

            filteredExtra.forEach(item => {
                const talentDiv = document.createElement('div');
                talentDiv.style.cssText = 'padding: 8px; background-color: rgba(255, 255, 255, 0.1); border: 1px solid var(--border-color); cursor: pointer; transition: background-color 0.2s;';

                // ADD NULL CHECK HERE
                if (!item.talent) {
                    talentDiv.innerHTML = `
            <div style="font-weight: bold; color: #dc143c;">${item.name} <span style="color: var(--card-text-secondary); font-weight: normal;">(${item.category})</span></div>
            <div style="font-size: 0.85em; color: var(--card-text-secondary); margin-top: 4px;">Not found in database</div>
        `;
                    talentDiv.style.cursor = 'default';
                    talentList.appendChild(talentDiv);
                    return; // Skip to next iteration
                }

                // Now safe to call getTalentRequirements
                const requirements = getTalentRequirements(item.talent);
                const reqText = requirements.length > 0
                    ? requirements.filter(r => !r.isPower).map(r => `${r.stat}: ${r.value}`).join(', ')
                    : 'No requirements';

                talentDiv.innerHTML = `
                <div style="font-weight: bold; color: var(--card-text-primary);">${item.name} <span style="color: var(--card-text-secondary); font-weight: normal;">(${item.category})</span></div>
                <div style="font-size: 0.85em; color: var(--card-text-secondary); margin-top: 4px;">${reqText}</div>
            `;

                talentDiv.addEventListener('mouseenter', () => {
                    talentDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                });
                talentDiv.addEventListener('mouseleave', () => {
                    talentDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                });
                talentDiv.addEventListener('click', () => {
                    document.getElementById('missingTalentsModal').classList.remove('active');
                    unselectTalent(item.talent.id);
                });

                talentList.appendChild(talentDiv);
            });

            extraContainer.appendChild(talentList);
        }

        // Show results
        document.getElementById('talentAnalysisResults').style.display = 'block';
    }

    // Event listeners
    document.getElementById('analyzeMissingBtn')?.addEventListener('click', () => {
        document.getElementById('missingTalentsModal').classList.add('active');
        document.getElementById('talentAnalysisResults').style.display = 'none';
        document.getElementById('missingTalentsInput').value = '';
    });

    document.getElementById('analyzeTalentsBtn')?.addEventListener('click', () => {
        const input = document.getElementById('missingTalentsInput').value.trim();
        if (!input) {
            showNotification('Please paste JSON data first', 'warning');
            return;
        }
        analyzeMissingTalents(input);
    });

    function parseTextCharacterSheet(text) {
        try {
            const lines = text.split('\n').map(line => line.trim());

            // Find the TALENTS section
            const talentsIndex = lines.findIndex(line => line === '== TALENTS ==');

            if (talentsIndex === -1) {
                throw new Error('Could not find "== TALENTS ==" section');
            }

            // Extract all talents after the TALENTS header
            const talents = [];
            for (let i = talentsIndex + 1; i < lines.length; i++) {
                const line = lines[i];

                // Stop if we hit another section marker or empty section
                if (line.startsWith('==') || line === '=====' || line === '') {
                    continue;
                }

                // Add non-empty talent names
                if (line.length > 0) {
                    talents.push(line);
                }
            }

            return { talents };
        } catch (error) {
            throw new Error(`Failed to parse character sheet: ${error.message}`);
        }
    }

    // Load categories when talents are loaded
    // Modify the loadTalents function:
    async function loadTalents() {
        try {
            const response = await fetch('./proxy.json');
            const data = await response.json();

            const talentsData = data.talents || {};

            const hiddenTalents = ['thank you'];

            allTalents = Object.entries(talentsData)
                .filter(([key, talent]) => talent && talent.name && !hiddenTalents.includes(key.toLowerCase()))
                .map(([key, talent]) => ({
                    id: key,
                    ...talent
                }));

            console.log(`Loaded ${allTalents.length} talents`);
            renderAvailableTalents();



            // Load categories
            loadTalentCategories();
        } catch (error) {
            console.error('Error loading talents:', error);
            document.getElementById('availableTalents').innerHTML =
                '<p class="empty-message">Error loading talents. Please check console.</p>';
        }
    }

    function loadOaths() {
        // Filter talents to get only Oath talents
        allOaths = allTalents.filter(talent =>
            talent.rarity === 'Oath' && talent.name.startsWith('Oath:')
        );

        console.log(`Loaded ${allOaths.length} oaths`);
        renderAvailableOaths();
    }

    function getOathRequirements(oath) {
        return getTalentRequirements(oath);
    }

    function getWeaponRequirements(weapon) {
        const reqs = [];

        if (weapon.reqs) {
            if (weapon.reqs.base) {
                for (const [stat, value] of Object.entries(weapon.reqs.base)) {
                    // Include ALL base stats, including Body and Mind
                    if (value > 0) {
                        reqs.push({ stat, value });
                    }
                }
            }

            if (weapon.reqs.weapon) {
                for (const [stat, value] of Object.entries(weapon.reqs.weapon)) {
                    if (value > 0) {
                        reqs.push({ stat, value });
                    }
                }
            }

            if (weapon.reqs.attunement) {
                for (const [stat, value] of Object.entries(weapon.reqs.attunement)) {
                    if (value > 0) {
                        reqs.push({ stat, value });
                    }
                }
            }

            if (weapon.reqs.power) {
                const powerValue = parseInt(weapon.reqs.power);
                if (powerValue > 0) {
                    reqs.push({ stat: 'Power', value: powerValue, isPower: true });
                }
            }
        }

        return reqs;
    }

    function calculateScaledDamage(weapon, currentStats) {
        const baseDamage = weapon.damage || 0;

        if (!weapon.scaling || Object.keys(weapon.scaling).length === 0) {
            return baseDamage;
        }

        let totalScaledDamage = baseDamage;

        // Calculate scaled damage for each scaling stat
        for (const [stat, scaling] of Object.entries(weapon.scaling)) {
            if (scaling > 0) {
                const weaponPoints = currentStats[stat] || 0;
                const scalingBonus = weaponPoints * ((baseDamage / 1000) * scaling);
                totalScaledDamage += scalingBonus;
            }
        }

        return totalScaledDamage;
    }

    function isWeaponAvailable(weapon, currentStats) {
        const requirements = getWeaponRequirements(weapon);

        if (requirements.length === 0) return true;

        for (const req of requirements) {
            // Skip Power requirements - they're automatically satisfied by total build
            if (req.isPower || req.stat === 'Power') {
                continue;
            }

            const currentValue = currentStats[req.stat] || 0;
            if (currentValue < req.value) {
                return false;
            }
        }

        return true;
    }

    function sortWeapons(weapons, sortBy, sortOrder) {
        return [...weapons].sort((a, b) => {
            let compareValue = 0;

            switch (sortBy) {
                case 'name':
                    compareValue = a.name.localeCompare(b.name);
                    break;
                case 'damage':
                    compareValue = (a.damage || 0) - (b.damage || 0);
                    break;
                case 'scaledDamage':
                    const currentStats = {};
                    document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
                        const statName = row.getAttribute('data-stat');
                        const postInput = row.querySelector('.post-shrine');
                        const postValue = parseInt(postInput.value) || 0;
                        currentStats[statName] = postValue;
                    });

                    const aScaled = calculateTotalDamage(a, currentStats);
                    const bScaled = calculateTotalDamage(b, currentStats);
                    compareValue = aScaled - bScaled;
                    break;
                case 'weight':
                    compareValue = (a.weight || 0) - (b.weight || 0);
                    break;
                case 'range':
                    compareValue = (a.range || 0) - (b.range || 0);
                    break;
                case 'speed':
                    compareValue = (a.speed || 0) - (b.speed || 0);
                    break;
                case 'pen':
                    compareValue = (a.pen || 0) - (b.pen || 0);
                    break;
                case 'chip':
                    compareValue = (a.chip || 0) - (b.chip || 0);
                    break;
                case 'requirements':
                    const aReqs = getWeaponRequirements(a).reduce((sum, req) => sum + req.value, 0);
                    const bReqs = getWeaponRequirements(b).reduce((sum, req) => sum + req.value, 0);
                    compareValue = aReqs - bReqs;
                    break;
            }

            return sortOrder === 'desc' ? -compareValue : compareValue;
        });
    }

    function weaponMatchesFilters(weapon, activeFilters, currentStats) {
        const wantsAvailable = activeFilters.has('available');
        const wantsUnavailable = activeFilters.has('unavailable');

        if (wantsAvailable || wantsUnavailable) {
            const available = isWeaponAvailable(weapon, currentStats);

            if (wantsAvailable && !available) return false;
            if (wantsUnavailable && available) return false;
        }

        const statFilters = new Set([...activeFilters].filter(f => f !== 'available' && f !== 'unavailable'));

        if (statFilters.size === 0) return true;

        const requirements = getWeaponRequirements(weapon);
        const weaponStats = new Set(requirements.map(req => req.stat));

        // Check scaling stats too
        if (weapon.scaling) {
            Object.keys(weapon.scaling).forEach(stat => weaponStats.add(stat));
        }

        for (const filter of statFilters) {
            if (!weaponStats.has(filter)) {
                return false;
            }
        }

        return true;
    }

    function weaponMatchesSearch(weapon, searchTerm) {
        if (!searchTerm) return true;

        const term = searchTerm.toLowerCase();
        return (
            weapon.name.toLowerCase().includes(term) ||
            (weapon.type && weapon.type.toLowerCase().includes(term)) ||
            (weapon.damageType && weapon.damageType.toLowerCase().includes(term))
        );
    }

    function calculateTotalDamage(weapon, currentStats) {
        const scaledDamage = calculateScaledDamage(weapon, currentStats);
        const hasBleed = weapon.damageType && weapon.damageType.toLowerCase().includes('bleed');

        if (hasBleed) {
            return scaledDamage * 1.15; // Total damage including bleed
        }

        return scaledDamage;
    }

    function equipWeapon(weaponId) {
        const weapon = allWeapons.find(w => w.id === weaponId);
        if (!weapon) return;

        // Check if weapon is already equipped
        if (equippedWeapons.some(w => w.id === weaponId)) {
            // Weapon is equipped, so unequip it
            unequipWeapon(weaponId);
            return;
        }

        // Use POST-SHRINE stats only
        const currentStats = {};
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const postInput = row.querySelector('.post-shrine');
            const postValue = parseInt(postInput.value) || 0;
            currentStats[statName] = postValue;
        });

        const isAvailable = isWeaponAvailable(weapon, currentStats);

        // If already meets requirements, just equip it
        if (isAvailable) {
            equippedWeapons.push(weapon);
            renderAvailableWeapons();
            showNotification(`Equipped ${weapon.name}`, 'success');
            return;
        }

        // Store pending selection
        pendingWeaponSelection = weapon;

        // Get requirements from weapon
        const weaponRequirements = getWeaponRequirements(weapon);

        // Get requirements from all selected talents
        const selectedTalentsList = Array.from(selectedTalents)
            .map(id => allTalents.find(t => t.id === id))
            .filter(t => t);

        // Get requirements from ALL equipped weapons
        const allEquippedWeaponRequirements = [];
        equippedWeapons.forEach(equippedWeapon => {
            const reqs = getWeaponRequirements(equippedWeapon);
            allEquippedWeaponRequirements.push(...reqs);
        });

        // Build combined requirements (new weapon + equipped weapons + talents)
        const combinedRequirements = {};

        // Add new weapon requirements (all as POST-SHRINE)
        weaponRequirements.forEach(req => {
            // FILTER OUT POWER REQUIREMENTS
            if (req.isPower || req.stat === 'Power') return;

            if (!combinedRequirements[req.stat]) {
                combinedRequirements[req.stat] = [];
            }
            // Weapon requirements are always POST-SHRINE
            combinedRequirements[req.stat].push({
                value: req.value,
                condition: 'post'
            });
        });

        // Add equipped weapon requirements (all as POST-SHRINE)
        allEquippedWeaponRequirements.forEach(req => {
            // FILTER OUT POWER REQUIREMENTS
            if (req.isPower || req.stat === 'Power') return;

            if (!combinedRequirements[req.stat]) {
                combinedRequirements[req.stat] = [];
            }
            // Weapon requirements are always POST-SHRINE
            combinedRequirements[req.stat].push({
                value: req.value,
                condition: 'post'
            });
        });

        // Add talent requirements
        selectedTalentsList.forEach(talent => {
            const requirements = getTalentRequirements(talent);
            if (requirements.length === 0) return;

            // Check if this is an Oath talent
            const isOathTalent = talent.rarity === 'Oath' || (talent.reqs && talent.reqs.from && talent.reqs.from.includes('Oath:'));

            requirements.forEach(req => {
                // FILTER OUT POWER REQUIREMENTS
                if (req.isPower || req.stat === 'Power') return;

                if (!combinedRequirements[req.stat]) {
                    combinedRequirements[req.stat] = [];
                }

                // Oath talents always use POST-SHRINE
                if (isOathTalent) {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'post'
                    });
                } else if (requirements.length === 1) {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'any'
                    });
                } else {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'while',
                        talentGroup: `talent_${talent.id}`,
                        allRequirements: requirements
                    });
                }
            });
        });

        document.querySelectorAll('#optimizer-tab .stat-row[data-stat]').forEach(optimizerRow => {
            const statName = optimizerRow.getAttribute('data-stat');

            optimizerRow.querySelectorAll('.input-group').forEach(inputGroup => {
                const input = inputGroup.querySelector('input[type="number"]');
                const value = parseInt(input.value) || 0;
                const condition = input.getAttribute('data-condition') || 'any';

                if (value > 0) {
                    if (!combinedRequirements[statName]) {
                        combinedRequirements[statName] = [];
                    }

                    const requirement = { value: value, condition: condition };

                    // If condition is "while", add the while stat and value
                    if (condition === 'while') {
                        const whileControls = inputGroup.querySelector('.while-controls');
                        if (whileControls) {
                            const whileStat = whileControls.querySelector('.while-stat-select').value;
                            const whileValue = parseInt(whileControls.querySelector('.while-value-input').value) || 0;
                            requirement.whileStat = whileStat;
                            requirement.whileValue = whileValue;
                        }
                    }

                    combinedRequirements[statName].push(requirement);
                }
            });
        });

        const deduplicatedRequirements = deduplicateRequirements(combinedRequirements);

        console.log('Weapon + Equipped Weapons + Talent requirements for optimizer:', deduplicatedRequirements);

        if (Object.keys(deduplicatedRequirements).length > 0) {
            // Reset derived stat choices only if we're starting fresh
            if (!window.selectedDerivedStats) {
                window.selectedDerivedStats = {};
            }

            const optimalBuild = calculateOptimalOrder(deduplicatedRequirements);

            // Check if we need user input for derived stats
            if (optimalBuild === null && window.pendingDerivedStatChoices && window.pendingDerivedStatChoices.length > 0) {
                showDerivedStatSelectionModal(window.pendingDerivedStatChoices);
                window.pendingRequirements = deduplicatedRequirements;
                window.pendingWeaponEquip = true; // Flag to indicate this is for weapon equip
                return;
            }

            if (optimalBuild) {
                pendingWeaponOptimalBuild = optimalBuild;
                showWeaponConfirmationModal(weapon, optimalBuild);
            } else {
                showNotification('No optimal build found to equip this weapon.', 'warning');
                pendingWeaponSelection = null;
            }
        }
    }

    function showWeaponSwapModal(newWeapon, isAvailable) {
        const modal = document.getElementById('weaponSwapModal');
        const comparisonContainer = document.getElementById('weaponComparisonCards');

        // Store the new weapon for later use
        window.pendingSwapWeapon = newWeapon;

        // Get current stats for damage calculations
        const currentStats = {};
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const postInput = row.querySelector('.post-shrine');
            const postValue = parseInt(postInput.value) || 0;
            currentStats[statName] = postValue;
        });

        // Build comparison cards
        comparisonContainer.innerHTML = '';

        // Current weapon card
        const currentCard = document.createElement('div');
        currentCard.className = 'weapon-comparison-card';
        currentCard.innerHTML = `
        <h3>Currently Equipped</h3>
        ${createWeaponComparisonHTML(equippedWeapon, currentStats)}
    `;
        comparisonContainer.appendChild(currentCard);

        // New weapon card
        const newCard = document.createElement('div');
        newCard.className = 'weapon-comparison-card';
        newCard.innerHTML = `
        <h3>New Weapon</h3>
        ${createWeaponComparisonHTML(newWeapon, currentStats)}
        ${!isAvailable ? '<p style="color: #dc143c; margin-top: 10px; font-size: 0.9em;">⚠ Requirements not met</p>' : ''}
    `;
        comparisonContainer.appendChild(newCard);

        modal.classList.add('active');
    }

    function createWeaponComparisonHTML(weapon, currentStats) {
        const scaledDamage = calculateScaledDamage(weapon, currentStats);
        const totalDamage = calculateTotalDamage(weapon, currentStats);
        const requirements = getWeaponRequirements(weapon);

        let html = `
        <div style="margin-bottom: 12px;">
            <strong style="font-size: 1.1em;">${weapon.name}</strong>
            <span style="display: block; color: var(--card-text-secondary); font-size: 0.85em; margin-top: 4px;">${weapon.type || 'Unknown'}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div>
                <span style="color: var(--card-text-secondary); font-size: 0.85em;">Base Damage:</span>
                <div style="font-weight: bold;">${weapon.damage || 0}</div>
            </div>
            <div>
                <span style="color: var(--card-text-secondary); font-size: 0.85em;">Scaled Damage:</span>
                <div style="font-weight: bold; color: #006400;">${scaledDamage.toFixed(1)}</div>
            </div>
            <div>
                <span style="color: var(--card-text-secondary); font-size: 0.85em;">Total Damage:</span>
                <div style="font-weight: bold; color: #006400;">${totalDamage.toFixed(1)}</div>
            </div>
            <div>
                <span style="color: var(--card-text-secondary); font-size: 0.85em;">Weight:</span>
                <div style="font-weight: bold;">${weapon.weight || 0}</div>
            </div>
        </div>
    `;

        if (requirements.length > 0) {
            html += `
            <div style="border-top: 1px solid var(--splitter-color); padding-top: 8px; margin-top: 8px;">
                <span style="color: var(--card-text-secondary); font-size: 0.85em; display: block; margin-bottom: 6px;">Requirements:</span>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${requirements.map(req =>
                `<span class="req-badge">${req.stat}: ${req.value}</span>`
            ).join('')}
                </div>
            </div>
        `;
        }

        return html;
    }

    document.getElementById('swapWeaponBtn')?.addEventListener('click', () => {
        if (window.pendingSwapWeapon) {
            // Replace current weapon with new weapon
            const newWeapon = window.pendingSwapWeapon;

            const currentStats = {};
            document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
                const statName = row.getAttribute('data-stat');
                const postInput = row.querySelector('.post-shrine');
                const postValue = parseInt(postInput.value) || 0;
                currentStats[statName] = postValue;
            });

            const isAvailable = isWeaponAvailable(newWeapon, currentStats);

            if (isAvailable) {
                equippedWeapon = newWeapon;
                renderAvailableWeapons();
                showNotification(`Swapped to ${newWeapon.name}`, 'success');
                document.getElementById('weaponSwapModal').classList.remove('active');
                window.pendingSwapWeapon = null;
            } else {
                // Close swap modal and proceed with optimization flow
                document.getElementById('weaponSwapModal').classList.remove('active');
                pendingWeaponSelection = newWeapon;

                // Same optimization logic as before
                const weaponRequirements = getWeaponRequirements(newWeapon);
                const selectedTalentsList = Array.from(selectedTalents)
                    .map(id => allTalents.find(t => t.id === id))
                    .filter(t => t);

                const combinedRequirements = {};

                weaponRequirements.forEach(req => {
                    if (!combinedRequirements[req.stat]) {
                        combinedRequirements[req.stat] = [];
                    }
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'post'
                    });
                });

                selectedTalentsList.forEach(talent => {
                    const requirements = getTalentRequirements(talent);
                    if (requirements.length === 0) return;

                    // Check if this is an Oath talent
                    const isOathTalent = talent.rarity === 'Oath' || (talent.reqs && talent.reqs.from && talent.reqs.from.includes('Oath:'));

                    requirements.forEach(req => {
                        if (!combinedRequirements[req.stat]) {
                            combinedRequirements[req.stat] = [];
                        }

                        // Oath talents always use POST-SHRINE
                        if (isOathTalent) {
                            combinedRequirements[req.stat].push({
                                value: req.value,
                                condition: 'post'
                            });
                        } else if (requirements.length === 1) {
                            combinedRequirements[req.stat].push({
                                value: req.value,
                                condition: 'any'
                            });
                        } else {
                            combinedRequirements[req.stat].push({
                                value: req.value,
                                condition: 'while',
                                talentGroup: `talent_${talent.id}`,
                                allRequirements: requirements
                            });
                        }
                    });
                });



                const deduplicatedRequirements = deduplicateRequirements(combinedRequirements);

                if (Object.keys(deduplicatedRequirements).length > 0) {
                    const optimalBuild = calculateOptimalOrder(deduplicatedRequirements);

                    if (optimalBuild) {
                        pendingWeaponOptimalBuild = optimalBuild;
                        showWeaponConfirmationModal(newWeapon, optimalBuild);
                    } else {
                        showNotification('No optimal build found to equip this weapon.', 'warning');
                        pendingWeaponSelection = null;
                    }
                }

                window.pendingSwapWeapon = null;
            }
        }
    });

    document.getElementById('equipBothBtn')?.addEventListener('click', () => {
        if (window.pendingSwapWeapon) {
            showNotification('Dual wielding feature coming soon!', 'info');
            document.getElementById('weaponSwapModal').classList.remove('active');
            window.pendingSwapWeapon = null;
        }
    });

    document.getElementById('cancelWeaponSwapBtn')?.addEventListener('click', () => {
        window.pendingSwapWeapon = null;
        document.getElementById('weaponSwapModal').classList.remove('active');
    });

    // Close modal when clicking outside
    document.getElementById('weaponSwapModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'weaponSwapModal') {
            window.pendingSwapWeapon = null;
            document.getElementById('weaponSwapModal').classList.remove('active');
        }
    });

    function unequipWeapon(weaponId) {
        const weaponIndex = equippedWeapons.findIndex(w => w.id === weaponId);
        if (weaponIndex === -1) return;

        const weaponName = equippedWeapons[weaponIndex].name;
        equippedWeapons.splice(weaponIndex, 1);

        // Recalculate build with remaining weapons and talents
        recalculateBuildForWeaponsAndTalents();

        renderAvailableWeapons();
        showNotification(`Unequipped ${weaponName}`, 'success');
    }

    function recalculateBuildForWeaponsAndTalents() {
        // If no weapons or talents, clear the build
        if (equippedWeapons.length === 0 && selectedTalents.size === 0) {
            document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
                const preInput = row.querySelector('.pre-shrine');
                const postInput = row.querySelector('.post-shrine');
                preInput.value = 0;
                postInput.value = 0;
            });
            updateSparePoints();
            return;
        }

        const combinedRequirements = {};

        // Get requirements from all equipped weapons
        equippedWeapons.forEach(weapon => {
            const requirements = getWeaponRequirements(weapon);
            requirements.forEach(req => {
                // FILTER OUT POWER REQUIREMENTS
                if (req.isPower || req.stat === 'Power') return;

                if (!combinedRequirements[req.stat]) {
                    combinedRequirements[req.stat] = [];
                }
                combinedRequirements[req.stat].push({
                    value: req.value,
                    condition: 'post'
                });
            });
        });

        // Get requirements from all selected talents
        const remainingTalents = Array.from(selectedTalents)
            .map(id => allTalents.find(t => t.id === id))
            .filter(t => t);

        remainingTalents.forEach(talent => {
            const requirements = getTalentRequirements(talent);
            if (requirements.length === 0) return;

            // Check if this is an Oath talent
            const isOathTalent = talent.rarity === 'Oath' || (talent.reqs && talent.reqs.from && talent.reqs.from.includes('Oath:'));

            requirements.forEach(req => {
                // FILTER OUT POWER REQUIREMENTS
                if (req.isPower || req.stat === 'Power') return;

                if (!combinedRequirements[req.stat]) {
                    combinedRequirements[req.stat] = [];
                }

                // Oath talents always use POST-SHRINE
                if (isOathTalent) {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'post'
                    });
                } else if (requirements.filter(r => !r.isPower && r.stat !== 'Power').length === 1) {
                    // Only count non-Power requirements
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'any'
                    });
                } else {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'while',
                        talentGroup: `talent_${talent.id}`,
                        allRequirements: requirements.filter(r => !r.isPower && r.stat !== 'Power')
                    });
                }
            });
        });

        // Deduplicate requirements
        const deduplicatedRequirements = deduplicateRequirements(combinedRequirements);

        // CHECK: If no actual requirements exist after filtering, just clear the build
        if (Object.keys(deduplicatedRequirements).length === 0) {
            console.log('No stat requirements remaining - clearing build');
            document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
                const preInput = row.querySelector('.pre-shrine');
                const postInput = row.querySelector('.post-shrine');
                preInput.value = 0;
                postInput.value = 0;
            });
            updateSparePoints();
            return;
        }

        // Calculate optimal build for remaining weapons and talents
        const optimalBuild = calculateOptimalOrder(deduplicatedRequirements);

        if (optimalBuild) {
            applyOptimalBuildToStats(optimalBuild);
            console.log('Build recalculated for remaining weapons and talents');
        } else {
            console.warn('Could not find optimal build for remaining weapons and talents');
        }
    }

    function showWeaponConfirmationModal(weapon, optimalBuild) {
        const modal = document.getElementById('weaponConfirmationModal');
        const messageEl = document.getElementById('weaponConfirmationMessage');
        const detailsList = document.getElementById('weaponDetailsList');
        const buildComparisonSection = document.getElementById('weaponBuildComparisonSection');

        messageEl.textContent = `Equipping "${weapon.name}" requires the following stats:`;

        // Show weapon details
        const requirements = getWeaponRequirements(weapon);
        detailsList.innerHTML = '';

        if (requirements.length > 0) {
            // Filter out Power from the display
            const displayRequirements = requirements.filter(r => !r.isPower);

            if (displayRequirements.length > 0) {
                const reqText = displayRequirements.map(r => `${r.stat}: ${r.value}`).join(', ');
                detailsList.innerHTML = `<div style="padding: 10px; background-color: rgba(255, 255, 255, 0.2);">${reqText}</div>`;
            }
        }

        // Get current build stats
        const currentBuild = collectManualBuildStats();

        // Show build comparison
        buildComparisonSection.innerHTML = '';

        const comparisonDiv = document.createElement('div');
        comparisonDiv.className = 'build-comparison';

        // Current build column
        const currentColumn = document.createElement('div');
        currentColumn.className = 'build-column';
        currentColumn.innerHTML = '<h3>Current Stats</h3>';

        // Optimal build column
        const optimalColumn = document.createElement('div');
        optimalColumn.className = 'build-column';
        optimalColumn.innerHTML = '<h3>Optimal Stats</h3>';

        // Collect all unique stats (excluding Power)
        const allStats = new Set([
            ...Object.keys(currentBuild.pre),
            ...Object.keys(currentBuild.post),
            ...Object.keys(optimalBuild.preShrine || {}),
            ...Object.keys(optimalBuild.finalStats || {})
        ]);

        // Remove Power from the stats to display
        allStats.delete('Power');

        allStats.forEach(stat => {
            const currentPre = currentBuild.pre[stat] || 0;
            const currentPost = currentBuild.post[stat] || 0;

            const optimalPre = (optimalBuild.preShrine && optimalBuild.preShrine[stat]) ? optimalBuild.preShrine[stat].currentPre : 0;
            const postShrineValue = optimalBuild.postShrine[stat] || 0;
            const optimalFinal = optimalBuild.finalStats[stat] || 0;

            let optimalPostDisplay;
            if (postShrineValue > 0) {
                optimalPostDisplay = `${optimalFinal}`;
            } else {
                optimalPostDisplay = `${optimalFinal}`;
            }

            const changed = false;

            // Current build stat
            const currentStatDiv = document.createElement('div');
            currentStatDiv.className = 'build-stat-item' + (changed ? ' changed' : '');
            currentStatDiv.innerHTML = `
            <span>${stat}:</span>
            <span>${currentPre} | ${currentPost}</span>
        `;
            currentColumn.appendChild(currentStatDiv);

            // Optimal build stat
            const optimalStatDiv = document.createElement('div');
            optimalStatDiv.className = 'build-stat-item' + (changed ? ' changed' : '');
            optimalStatDiv.innerHTML = `
            <span>${stat}:</span>
            <span>${optimalPre} | ${optimalPostDisplay}</span>
        `;
            optimalColumn.appendChild(optimalStatDiv);
        });

        comparisonDiv.appendChild(currentColumn);
        comparisonDiv.appendChild(optimalColumn);
        buildComparisonSection.appendChild(comparisonDiv);

        modal.classList.add('active');
    }

    function confirmWeaponEquip() {
        if (!pendingWeaponSelection) return;

        // Apply optimal build if available
        if (pendingWeaponOptimalBuild) {
            applyOptimalBuildToStats(pendingWeaponOptimalBuild);
        }

        // Equip the weapon
        equippedWeapons.push(pendingWeaponSelection);

        const weaponName = pendingWeaponSelection.name;

        // Clear pending data
        pendingWeaponSelection = null;
        pendingWeaponOptimalBuild = null;

        // Close modal and re-render
        document.getElementById('weaponConfirmationModal').classList.remove('active');
        renderAvailableWeapons();

        showNotification(`Equipped ${weaponName}`, 'success');
    }

    function declineWeaponEquip() {
        pendingWeaponSelection = null;
        pendingWeaponOptimalBuild = null;
        document.getElementById('weaponConfirmationModal').classList.remove('active');
    }

    function createWeaponCard(weapon) {
        const card = document.createElement('div');
        card.className = 'weapon-card';
        card.dataset.weaponId = weapon.id;

        const requirements = getWeaponRequirements(weapon);

        const currentStats = {};
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const postInput = row.querySelector('.post-shrine');
            const postValue = parseInt(postInput.value) || 0;
            currentStats[statName] = postValue;
        });

        const isAvailable = isWeaponAvailable(weapon, currentStats);

        if (!isAvailable) {
            card.classList.add('unavailable');
        }

        const isEquipped = equippedWeapons.some(w => w.id === weapon.id);

        if (isEquipped) {
            card.classList.add('equipped');
            card.style.order = '-1'; // Move to top
        }

        // Build stats grid
        let statsHTML = '<div class="weapon-stats-grid">';

        if (weapon.damage !== undefined) {
            const scaledDamage = calculateScaledDamage(weapon, currentStats);
            const hasScaling = weapon.scaling && Object.keys(weapon.scaling).length > 0 && scaledDamage !== weapon.damage;

            const hasBleed = weapon.damageType && weapon.damageType.toLowerCase().includes('bleed');
            const bleedDamage = hasBleed ? scaledDamage * 0.15 : 0;

            let damageDisplay = `
            <span class="weapon-stat-value">
                ${weapon.damage}${hasScaling ? ` <span style="color: var(--card-text-secondary); font-size: 0.85em;">(scales to ${scaledDamage.toFixed(1)})</span>` : ''}
                ${hasBleed ? ` <span style="color: #dc143c; font-size: 0.85em;">(+${bleedDamage.toFixed(1)} bleed)</span>` : ''}
            </span>
        `;

            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Damage:</span>
                ${damageDisplay}
            </div>
        `;
        }

        if (weapon.damageType) {
            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Type:</span>
                <span class="weapon-stat-value">${weapon.damageType}</span>
            </div>
        `;
        }

        if (weapon.weight !== undefined) {
            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Weight:</span>
                <span class="weapon-stat-value">${weapon.weight}</span>
            </div>
        `;
        }

        if (weapon.range !== undefined) {
            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Range:</span>
                <span class="weapon-stat-value">${weapon.range}</span>
            </div>
        `;
        }

        if (weapon.speed !== undefined) {
            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Speed:</span>
                <span class="weapon-stat-value">${weapon.speed}</span>
            </div>
        `;
        }

        if (weapon.pen !== undefined && weapon.pen > 0) {
            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Penetration:</span>
                <span class="weapon-stat-value">${weapon.pen}</span>
            </div>
        `;
        }

        if (weapon.chip !== undefined && weapon.chip > 0) {
            statsHTML += `
            <div class="weapon-stat-item">
                <span class="weapon-stat-label">Chip:</span>
                <span class="weapon-stat-value">${weapon.chip}</span>
            </div>
        `;
        }

        statsHTML += '</div>';

        // Build requirements section
        let reqsHTML = '';
        if (requirements.length > 0) {
            reqsHTML = '<div class="weapon-requirements">';
            requirements.forEach(req => {
                let badgeClass = isAvailable ? 'req-badge available' : 'req-badge unavailable';
                if (req.isPower) {
                    badgeClass = 'req-badge power-req';
                }
                reqsHTML += `<span class="${badgeClass}">${req.stat}: ${req.value}</span>`;
            });
            reqsHTML += '</div>';
        }

        // Build scaling section
        let scalingHTML = '';
        if (weapon.scaling && Object.keys(weapon.scaling).length > 0) {
            const validScaling = Object.entries(weapon.scaling).filter(([stat, value]) => value > 0);

            if (validScaling.length > 0) {
                scalingHTML = `
                <div style="border-top: 1px solid var(--splitter-color); margin-top: 8px; padding-top: 8px;">
                    <div style="font-size: 0.85em; color: var(--card-text-secondary); margin-bottom: 6px; font-weight: 600;">Scaling:</div>
                    <div class="weapon-scaling">
            `;
                validScaling.forEach(([stat, value]) => {
                    scalingHTML += `<span class="scaling-badge">${stat}: ${value}</span>`;
                });
                scalingHTML += `
                    </div>
                </div>
            `;
            }
        }

        const equippedHTML = isEquipped ? `
        <div class="weapon-equipped-badge">
            <span>EQUIPPED</span>
        </div>
    ` : '';

        card.innerHTML = `
        <div class="weapon-header">
            <span class="weapon-name">${weapon.name}</span>
            <span class="weapon-type">${weapon.type || 'Unknown'}</span>
        </div>
        ${statsHTML}
        ${scalingHTML}
        ${reqsHTML}
        ${equippedHTML}
    `;

        card.addEventListener('click', () => {
            equipWeapon(weapon.id);
        });

        return card;
    }


    function renderAvailableWeapons() {
        const container = document.getElementById('availableWeapons');
        const searchTerm = document.getElementById('searchWeapons').value;

        // Use POST-SHRINE stats only
        const currentStats = {};
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const postInput = row.querySelector('.post-shrine');
            const postValue = parseInt(postInput.value) || 0;
            currentStats[statName] = postValue;
        });

        if (allWeapons.length === 0) {
            container.innerHTML = '<p class="empty-message">No weapons available</p>';
            return;
        }

        container.innerHTML = '';

        let visibleCount = 0;

        let weapons = sortWeapons(allWeapons, weaponSortBy, weaponSortOrder);

        weapons.forEach(weapon => {
            const card = createWeaponCard(weapon);

            const matchesFilter = weaponMatchesFilters(weapon, weaponFilters, currentStats);
            const matchesSearchTerm = weaponMatchesSearch(weapon, searchTerm);

            if (!matchesFilter || !matchesSearchTerm) {
                card.classList.add('hidden');
            } else {
                visibleCount++;
            }

            container.appendChild(card);
        });

        if (visibleCount === 0) {
            container.innerHTML = '<p class="empty-message">No weapons match your filters</p>';
        }
    }

    // Setup weapon filter buttons
    function setupWeaponFilterButtons() {
        const container = document.getElementById('weaponFilters');
        const filterButtons = container.querySelectorAll('.filter-btn:not(.clear-filters)');
        const clearButton = container.querySelector('.clear-filters');

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.getAttribute('data-filter');

                if (weaponFilters.has(filter)) {
                    weaponFilters.delete(filter);
                    button.classList.remove('active');
                } else {
                    weaponFilters.add(filter);
                    button.classList.add('active');
                }

                renderAvailableWeapons();
            });
        });

        clearButton.addEventListener('click', () => {
            weaponFilters.clear();
            filterButtons.forEach(btn => btn.classList.remove('active'));
            renderAvailableWeapons();
        });
    }


    // Setup filters for analysis modal
    function setupAnalysisFilters() {
        const filterButtons = document.querySelectorAll('#analysisAvailabilityFilters .filter-btn, #analysisStatFilters .filter-btn:not(.clear-filters)');
        const clearButton = document.querySelector('#analysisStatFilters .clear-filters');

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.getAttribute('data-filter');

                if (analysisFilters.has(filter)) {
                    analysisFilters.delete(filter);
                    button.classList.remove('active');
                } else {
                    analysisFilters.add(filter);
                    button.classList.add('active');
                }

                // Re-display with filters if we have data
                if (analysisData) {
                    displayTalentAnalysis(analysisData);
                }
            });
        });

        clearButton.addEventListener('click', () => {
            analysisFilters.clear();
            filterButtons.forEach(btn => btn.classList.remove('active'));

            // Re-display without filters if we have data
            if (analysisData) {
                displayTalentAnalysis(analysisData);
            }
        });
    }

    // Call this in your DOMContentLoaded
    // Add this line at the end of your DOMContentLoaded function:
    setupAnalysisFilters();

    document.getElementById('clearAllTalents')?.addEventListener('click', () => {
        if (selectedTalents.size === 0) return;

        // Show modal instead of confirm dialog
        const modal = document.getElementById('clearTalentsModal');
        const message = document.getElementById('clearTalentsMessage');

        message.textContent = `Are you sure you want to remove all ${selectedTalents.size} selected talents and clear your build?`;

        modal.classList.add('active');
    });

    document.getElementById('confirmClearBtn')?.addEventListener('click', () => {
        selectedTalents.clear();
        recalculateBuildForWeaponsAndTalents();
        renderBothPanels();

        document.getElementById('clearTalentsModal').classList.remove('active');
        showNotification('All talents cleared successfully', 'success');
    });

    document.getElementById('declineClearBtn')?.addEventListener('click', () => {
        document.getElementById('clearTalentsModal').classList.remove('active');
    });

    // Close modal when clicking outside
    document.getElementById('clearTalentsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'clearTalentsModal') {
            document.getElementById('clearTalentsModal').classList.remove('active');
        }
    });

    function getTalentRequirements(talent) {
        const reqs = [];

        if (talent.reqs) {
            // Base stats
            if (talent.reqs.base) {
                for (const [stat, value] of Object.entries(talent.reqs.base)) {
                    if (value > 0) {
                        // Keep Body and Mind as separate requirements
                        reqs.push({ stat, value });
                    }
                }
            }

            // Weapon stats
            if (talent.reqs.weapon) {
                for (const [stat, value] of Object.entries(talent.reqs.weapon)) {
                    if (value > 0) {
                        reqs.push({ stat, value });
                    }
                }
            }

            // Attunement stats
            if (talent.reqs.attunement) {
                for (const [stat, value] of Object.entries(talent.reqs.attunement)) {
                    if (value > 0) {
                        reqs.push({ stat, value });
                    }
                }
            }

            // NEW: Power requirement
            if (talent.reqs.power) {
                const powerValue = parseInt(talent.reqs.power);
                if (powerValue > 0) {
                    reqs.push({ stat: 'Power', value: powerValue, isPower: true });
                }
            }
        }

        return reqs;
    }

    function resolveBodyMindRequirements(talent) {
        const derivedStatMapping = {
            'Body': ['Strength', 'Fortitude', 'Agility'],
            'Mind': ['Intelligence', 'Willpower', 'Charisma']
        };

        const rawRequirements = getTalentRequirements(talent);
        const resolvedRequirements = [];

        for (const req of rawRequirements) {
            // Check if this is a derived stat
            if (derivedStatMapping[req.stat]) {
                const componentStats = derivedStatMapping[req.stat];
                const currentBuild = getCurrentMaxBuildStats();

                // Find which component stat to use
                let chosenStat = componentStats[0];
                let bestCurrentValue = currentBuild[chosenStat] || 0;

                // Use the stat with the highest current value
                for (const compStat of componentStats) {
                    const currentValue = currentBuild[compStat] || 0;
                    if (currentValue > bestCurrentValue) {
                        bestCurrentValue = currentValue;
                        chosenStat = compStat;
                    }
                }

                // Check if user has made a selection for this derived stat
                if (window.selectedDerivedStats && window.selectedDerivedStats[req.stat]) {
                    chosenStat = window.selectedDerivedStats[req.stat];
                }

                // Add resolved requirement
                resolvedRequirements.push({
                    stat: chosenStat,
                    value: req.value
                });
            } else {
                // Not a derived stat, keep as is
                resolvedRequirements.push(req);
            }
        }

        return resolvedRequirements;
    }


    function getAllRequirementsForStatOrder(talent) {
        const allReqs = [];
        const seen = new Map(); // Track highest value for each stat

        // Get direct requirements - USE THE NEW RESOLVER
        const directReqs = resolveBodyMindRequirements(talent);
        directReqs.forEach(req => {
            // Skip Body, Mind, and Power - Power is derived from points, not investable
            if (req.stat === 'Body' || req.stat === 'Mind' || req.isPower || req.stat === 'Power') {
                return;
            }

            if (!seen.has(req.stat) || seen.get(req.stat) < req.value) {
                seen.set(req.stat, req.value);
            }
        });

        // Get requirements from prerequisite talents
        const prerequisites = getPrerequisiteTalents(talent);
        prerequisites.forEach(prereqTalent => {
            const prereqReqs = resolveBodyMindRequirements(prereqTalent); // USE RESOLVER HERE TOO
            prereqReqs.forEach(req => {
                // Skip Body, Mind, and Power - Power is derived from points, not investable
                if (req.stat === 'Body' || req.stat === 'Mind' || req.isPower || req.stat === 'Power') {
                    return;
                }

                if (!seen.has(req.stat) || seen.get(req.stat) < req.value) {
                    seen.set(req.stat, req.value);
                }
            });
        });

        // Convert map back to array
        seen.forEach((value, stat) => {
            allReqs.push({ stat, value });
        });

        return allReqs;
    }



    function getPrerequisiteTalents(talent, visited = new Set()) {
        const prerequisites = [];

        // Prevent infinite loops
        if (visited.has(talent.id)) {
            return prerequisites;
        }
        visited.add(talent.id);

        if (talent.reqs && talent.reqs.from) {
            const requiredTalentNames = getRequiredTalentNames(talent);

            requiredTalentNames.forEach(reqName => {
                const requiredTalent = findTalentByName(reqName);
                if (requiredTalent) {
                    // Add the prerequisite talent
                    prerequisites.push(requiredTalent);

                    // Recursively get prerequisites of prerequisites
                    const nestedPrereqs = getPrerequisiteTalents(requiredTalent, visited);
                    prerequisites.push(...nestedPrereqs);
                }
            });
        }

        return prerequisites;
    }

    function isTalentAvailable(talent, currentStats) {
        const requirements = getTalentRequirements(talent);
        if (requirements.length === 0) return true;

        // Check Power requirements using calculated power level (not an investable stat).
        // Power is derived from total invested points: Power N = floor(points/15)+1, max 20.
        const currentPower = calculateCurrentPower();
        for (const req of requirements) {
            if (req.isPower || req.stat === 'Power') {
                if (currentPower < req.value) return false;
            }
        }

        const nonPowerReqs = requirements.filter(r => !r.isPower && r.stat !== 'Power');
        if (nonPowerReqs.length === 0) return true;

        // Requirements must be satisfied SIMULTANEOUSLY (all pre-shrine or all post-shrine).
        // Using max(pre, post) per stat would falsely allow e.g. STR 30 pre-only + FTD 30 post-only.
        const { pre, post } = collectPrePostStats();
        const preDerived = calculateBodyAndMind(pre);
        const postDerived = calculateBodyAndMind(post);

        const metIn = (stats, derived) => nonPowerReqs.every(req => {
            const val = (req.stat === 'Body' || req.stat === 'Mind')
                ? (derived[req.stat] || 0)
                : (stats[req.stat] || 0);
            return val >= req.value;
        });

        return metIn(pre, preDerived) || metIn(post, postDerived);
    }

    // Function to sort talents
    function sortTalents(talents, sortBy, sortOrder) {
        return [...talents].sort((a, b) => {
            let compareValue = 0;

            if (sortBy === 'name') {
                compareValue = a.name.localeCompare(b.name);
            } else if (sortBy === 'points') {
                // Get the total points required (sum of all requirements)
                const aPoints = getTalentTotalPoints(a);
                const bPoints = getTalentTotalPoints(b);
                compareValue = aPoints - bPoints;
            }

            // Reverse if descending order
            return sortOrder === 'desc' ? -compareValue : compareValue;
        });
    }

    // Helper function to get total points for a talent
    function getTalentTotalPoints(talent) {
        const requirements = getTalentRequirements(talent);
        if (requirements.length === 0) return 0;

        // Sum up all requirement values
        return requirements.reduce((sum, req) => sum + req.value, 0);
    }

    function requiresOath(talent, visited = new Set()) {
        // Prevent infinite loops
        if (visited.has(talent.id)) {
            return false;
        }
        visited.add(talent.id);

        // Check if this talent directly requires an oath
        if (talent.reqs && talent.reqs.from) {
            if (talent.reqs.from.includes('Oath:')) {
                return true;
            }
        }

        // Check if any required talents require an oath
        const requiredTalentNames = getRequiredTalentNames(talent);
        for (const reqName of requiredTalentNames) {
            const requiredTalent = findTalentByName(reqName);
            if (requiredTalent && requiresOath(requiredTalent, visited)) {
                return true;
            }
        }

        return false;
    }

    // Function to filter talents by rarity
    function filterByRarity(talents) {
        return talents.filter(talent => {
            const rarity = talent.rarity;

            // If Origin talent and toggle is off, filter it out
            if (rarity === 'Origin' && !showOriginTalents) {
                return false;
            }

            if (rarity == 'Equipment' && !showEquipmentTalents) {
                return false;
            }

            if (rarity == 'Outfit' && !showOutfitTalents) {
                return false;
            }

            // If Quest talent and toggle is off, filter it out
            if (rarity === 'Quest' && !showQuestTalents) {
                return false;
            }

            // If talent requires oath and toggle is off, filter it out
            const isOathRelated = rarity === 'Oath' // || requiresOath(talent);
            if (!showOathTalents && isOathRelated) {
                return false;
            }

            return true;
        });
    }

    function createTalentCard(talent, isSelected = false) {
        const card = document.createElement('div');
        card.className = 'talent-card';
        card.dataset.talentId = talent.id;
        // Use ORIGINAL requirements for display (shows Body/Mind as-is)
        const requirements = getTalentRequirements(talent);

        // Check if this talent has conflicts with any selected talents
        const conflictingTalents = [];
        if (talent.exclusiveWith && talent.exclusiveWith.length > 0) {
            talent.exclusiveWith.forEach(exclusiveName => {
                if (!exclusiveName || exclusiveName === '') return;
                const exclusiveTalent = findTalentByName(exclusiveName);
                if (exclusiveTalent && selectedTalents.has(exclusiveTalent.id)) {
                    conflictingTalents.push(exclusiveName);
                }
            });
        }

        const hasExclusiveConflict = conflictingTalents.length > 0;

        if (hasExclusiveConflict) {
            card.classList.add('exclusive-conflict');
        }

        let fromHTML = '';
        if (talent.reqs && talent.reqs.from) {
            fromHTML = `<div class="talent-from">From: ${talent.reqs.from}</div>`;
        }

        let statsHTML = '';
        if (talent.stats && talent.stats !== 'N/A' && talent.stats.trim() !== '') {
            statsHTML = `<div class="talent-stats">${talent.stats}</div>`;
        }

        let exclusiveHTML = '';
        if (hasExclusiveConflict) {
            const exclusivesList = conflictingTalents.join(', ');
            exclusiveHTML = `<div class="talent-exclusive">Conflicts with: ${exclusivesList}</div>`;
        }

        let reqsHTML = '';
        if (requirements.length > 0) {
            reqsHTML = '<div class="talent-requirements">';
            requirements.forEach(req => {
                // Add special styling for different requirement types
                let badgeClass = 'req-badge';

                if (req.isPower) {
                    // Special class for power requirements
                    badgeClass = 'req-badge power-req';
                } else if (req.stat === 'Body' || req.stat === 'Mind') {
                    // Derived stats
                    badgeClass = 'req-badge derived-stat';
                }

                reqsHTML += `<span class="${badgeClass}">${req.stat}: ${req.value}</span>`;
            });
            reqsHTML += '</div>';
        }

        const nameClass = hasExclusiveConflict ? 'talent-name conflict' : 'talent-name';

        card.innerHTML = `
        <div class="talent-header">
            <span class="${nameClass}">${talent.name}</span>
            <span class="talent-rarity">${talent.rarity || 'Common'}</span>
        </div>
        <div class="talent-desc">${talent.desc || 'No description available'}</div>
        ${fromHTML}
        ${statsHTML}
        ${exclusiveHTML}
        ${reqsHTML}
    `;

        card.addEventListener('click', () => {
            if (isSelected) {
                unselectTalent(talent.id);
            } else {
                selectTalent(talent.id);
            }
        });

        return card;
    }


    function findTalentByName(talentName) {
        const normalizedSearch = normalizeTalentName(talentName);
        return allTalents.find(t => normalizeTalentName(t.name.toLowerCase()) === normalizedSearch.toLowerCase());
    }


    function getRequiredTalentNames(talent) {
        const requiredTalents = [];

        if (talent.reqs && talent.reqs.from) {
            // Parse the "from" field - it can contain multiple talents separated by commas
            const fromParts = talent.reqs.from.split(',').map(part => part.trim());

            fromParts.forEach(part => {
                // Handle "Oath:" prefix specially
                if (part.startsWith('Oath:')) {
                    // Keep the full "Oath: Name" format for matching
                    requiredTalents.push(part.trim());
                    return;
                }

                // Handle "Murmur:" prefix specially (ADD THIS)
                if (part.startsWith('Murmur:')) {
                    // Keep the full "Murmur: Name" format for matching
                    requiredTalents.push(part.trim());
                    return;
                }

                // Skip other non-talent identifiers
                if (part.startsWith('Race:') ||
                    part.startsWith('Origin:') ||
                    part.startsWith('Resonance:')) {
                    return;
                }

                // Skip quest/location descriptions (they usually contain words like "Complete", "Slay", "Quest", etc.)
                if (part.includes('Complete') ||
                    part.includes('Slay') ||
                    part.includes('Quest') ||
                    part.includes('Obtain') ||
                    part.includes('Find')) {
                    return;
                }

                // The part should be a talent name
                requiredTalents.push(part);
            });
        }

        return requiredTalents;
    }

    function selectTalentWithDependencies(talentId, visited = new Set()) {
        // Prevent infinite loops
        if (visited.has(talentId)) {
            return;
        }
        visited.add(talentId);

        const talent = allTalents.find(t => t.id === talentId);
        if (!talent) {
            return;
        }

        // Get required talents
        const requiredTalentNames = getRequiredTalentNames(talent);

        // Recursively select required talents first
        requiredTalentNames.forEach(reqName => {
            const requiredTalent = findTalentByName(reqName);
            if (requiredTalent && !selectedTalents.has(requiredTalent.id)) {
                selectTalentWithDependencies(requiredTalent.id, visited);
            }
        });

        // Finally, select this talent
        selectedTalents.add(talentId);
    }

    function selectTalent(talentId) {
        const talent = allTalents.find(t => t.id === talentId);
        if (!talent) return;

        // CHECK FOR OATH CONFLICT - Add this section at the very beginning
        if (isOathTalent(talent) && talent.rarity === 'Oath') {
            const currentOath = getCurrentOath();
            if (currentOath && currentOath.id !== talentId) {
                // User is trying to add a different oath
                showOathSwapModal(currentOath, talent);
                return;
            }
        }

        // Store the pending selection
        pendingTalentSelection = {
            talentId: talentId,
            dependencyIds: []
        };

        // Collect all dependencies
        const visited = new Set();
        collectDependencies(talentId, visited);
        pendingTalentSelection.dependencyIds = Array.from(visited);

        // Get current build stats (max of pre and post)
        const currentMaxStats = getCurrentMaxBuildStats();

        // Get requirements from new talents
        const newTalents = pendingTalentSelection.dependencyIds.map(id => allTalents.find(t => t.id === id)).filter(t => t);

        // Check if all requirements are already met
        let allRequirementsMet = true;
        for (const talent of newTalents) {
            const requirements = getTalentRequirements(talent);
            for (const req of requirements) {
                // Skip Power requirements - they're automatically satisfied
                if (req.isPower || req.stat === 'Power') continue;

                // Handle Body/Mind checking
                if (req.stat === 'Body' || req.stat === 'Mind') {
                    const derivedStats = calculateBodyAndMind(currentMaxStats);
                    if (derivedStats[req.stat] < req.value) {
                        allRequirementsMet = false;
                        break;
                    }
                } else {
                    if ((currentMaxStats[req.stat] || 0) < req.value) {
                        allRequirementsMet = false;
                        break;
                    }
                }
            }
            if (!allRequirementsMet) break;
        }

        // If all requirements are met, just add the talents without showing modal
        if (allRequirementsMet) {
            pendingTalentSelection.dependencyIds.forEach(id => {
                selectedTalents.add(id);
            });
            pendingTalentSelection = null;
            renderBothPanels();
            return;
        }

        // Get ALL currently selected talents
        const allSelectedTalents = Array.from(selectedTalents)
            .map(id => allTalents.find(t => t.id === id))
            .filter(t => t);

        // Combine with new talents we're about to add
        const allTalentsToConsider = [...allSelectedTalents, ...newTalents];

        const combinedRequirements = {};

        // NEW: Add weapon requirements if a weapon is equipped
        if (equippedWeapons && equippedWeapons.length > 0) {
            equippedWeapons.forEach(equippedWeapon => {
                const weaponRequirements = getWeaponRequirements(equippedWeapon);
                weaponRequirements.forEach(req => {
                    // FILTER OUT POWER REQUIREMENTS
                    if (req.isPower || req.stat === 'Power') return;

                    if (!combinedRequirements[req.stat]) {
                        combinedRequirements[req.stat] = [];
                    }
                    // Weapon requirements are always POST-SHRINE
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'post'
                    });
                });
            });
        }

        // First pass - collect all explicit stat requirements
        const explicitStatRequirements = new Map();
        const derivedStatRequirements = new Map(); // Store Body/Mind requirements separately

        allTalentsToConsider.forEach((talent) => {
            const requirements = getTalentRequirements(talent);
            if (requirements.length === 0) return;

            const fromOathTalent = isOathTalent(talent);

            requirements.forEach(req => {
                if (req.isPower || req.stat === 'Power') return;

                if (!combinedRequirements[req.stat]) {
                    combinedRequirements[req.stat] = [];
                }

                // NEW: Check if optimizer has a setting for this stat
                const optimizerRow = document.querySelector(`#optimizer-tab .stat-row[data-stat="${req.stat}"]`);
                const optimizerInput = optimizerRow?.querySelector('input[type="number"]');
                const optimizerCondition = optimizerInput?.getAttribute('data-condition');
                const optimizerValue = parseInt(optimizerInput?.value) || 0;

                // Use optimizer setting if it exists and covers this requirement
                if (optimizerValue >= req.value && optimizerCondition) {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: optimizerCondition
                    });
                } else {
                    // Fall back to default logic
                    if (fromOathTalent) {
                        combinedRequirements[req.stat].push({
                            value: req.value,
                            condition: 'post'
                        });
                    } else if (requirements.length === 1) {
                        combinedRequirements[req.stat].push({
                            value: req.value,
                            condition: 'any'
                        });
                    } else {
                        combinedRequirements[req.stat].push({
                            value: req.value,
                            condition: 'while',
                            talentGroup: `talent_${talent.id}`,
                            allRequirements: requirements
                        });
                    }
                }
            });
        });

        document.querySelectorAll('#optimizer-tab .stat-row[data-stat]').forEach(optimizerRow => {
            const statName = optimizerRow.getAttribute('data-stat');

            optimizerRow.querySelectorAll('.input-group').forEach(inputGroup => {
                const input = inputGroup.querySelector('input[type="number"]');
                const value = parseInt(input.value) || 0;
                const condition = input.getAttribute('data-condition') || 'any';

                if (value > 0) {
                    if (!combinedRequirements[statName]) {
                        combinedRequirements[statName] = [];
                    }

                    const requirement = { value: value, condition: condition };

                    // If condition is "while", add the while stat and value
                    if (condition === 'while') {
                        const whileControls = inputGroup.querySelector('.while-controls');
                        if (whileControls) {
                            const whileStat = whileControls.querySelector('.while-stat-select').value;
                            const whileValue = parseInt(whileControls.querySelector('.while-value-input').value) || 0;
                            requirement.whileStat = whileStat;
                            requirement.whileValue = whileValue;
                        }
                    }

                    combinedRequirements[statName].push(requirement);
                }
            });
        });

        // Second pass - resolve Body/Mind requirements
        const derivedStatMapping = {
            'Body': ['Strength', 'Fortitude', 'Agility'],
            'Mind': ['Intelligence', 'Willpower', 'Charisma']
        };

        derivedStatRequirements.forEach((requirements, derivedStat) => {
            const componentStats = derivedStatMapping[derivedStat];

            requirements.forEach(req => {
                // Check if ANY component stat already has an explicit requirement that satisfies this
                let alreadySatisfied = false;
                let satisfyingStat = null;

                for (const compStat of componentStats) {
                    const explicitReq = explicitStatRequirements.get(compStat) || 0;
                    if (explicitReq >= req.value) {
                        alreadySatisfied = true;
                        satisfyingStat = compStat;
                        console.log(`${derivedStat} ${req.value} already satisfied by ${compStat} ${explicitReq}`);
                        break;
                    }
                }

                // If not already satisfied by an explicit requirement, pass the DERIVED stat to optimizer
                if (!alreadySatisfied) {
                    console.log(`Passing ${derivedStat} ${req.value} to optimizer for resolution`);

                    // Add to combined requirements AS THE DERIVED STAT (Mind/Body)
                    if (!combinedRequirements[derivedStat]) {
                        combinedRequirements[derivedStat] = [];
                    }
                    if (req.isOath) {
                        combinedRequirements[derivedStat].push({
                            value: req.value,
                            condition: 'post'
                        });
                    } else if (req.multiReq) {
                        combinedRequirements[derivedStat].push({
                            value: req.value,
                            condition: 'while',
                            talentGroup: `talent_${req.talent.id}`,
                            allRequirements: req.allRequirements
                        });
                    } else {
                        combinedRequirements[derivedStat].push({
                            value: req.value,
                            condition: 'any'
                        });
                    }
                }
            });
        });

        const deduplicatedRequirements = deduplicateRequirements(combinedRequirements);

        console.log('=== TALENT SELECTION DEBUG ===');
        console.log('New talents being added:', newTalents.map(t => t.name));
        console.log('Already selected talents:', allSelectedTalents.map(t => t.name));
        console.log('\n--- Explicit Stat Requirements ---');
        explicitStatRequirements.forEach((value, stat) => {
            console.log(`${stat}: ${value}`);
        });
        console.log('\n--- Derived Stat Requirements ---');
        derivedStatRequirements.forEach((reqs, stat) => {
            console.log(`${stat}:`, reqs.map(r => `${r.value} (from ${r.talent.name})`));
        });
        console.log('\n--- Combined Requirements ---');

        for (const [statName, requirements] of Object.entries(deduplicatedRequirements)) {
            console.log(`\n[${statName}]:`);
            requirements.forEach((req, index) => {
                if (req.condition === 'any') {
                    console.log(`  ${index + 1}. Value: ${req.value}, Condition: ANY`);
                } else if (req.condition === 'while') {
                    const otherStats = req.allRequirements
                        .filter(r => r.stat !== statName)
                        .map(r => `${r.stat}: ${r.value}`)
                        .join(', ');
                    console.log(`  ${index + 1}. Value: ${req.value}, Condition: WHILE (${otherStats}), Group: ${req.talentGroup}`);
                } else {
                    console.log(`  ${index + 1}. Value: ${req.value}, Condition: ${req.condition}`);
                }
            });
        }
        console.log('\n==============================\n');

        const hasNewRequirements = newTalents.some(talent => {
            const reqs = getTalentRequirements(talent);
            // Only count non-Power requirements
            return reqs.some(req => !req.isPower && req.stat !== 'Power');
        });

        // Only calculate if there are actual requirements
        if (Object.keys(deduplicatedRequirements).length > 0) {
            // Reset derived stat choices only if we're starting fresh
            if (!window.selectedDerivedStats) {
                window.selectedDerivedStats = {};
            }

            const optimalBuild = calculateOptimalOrder(deduplicatedRequirements);

            // Check if we need user input for derived stats
            if (optimalBuild === null && window.pendingDerivedStatChoices && window.pendingDerivedStatChoices.length > 0) {
                showDerivedStatSelectionModal(window.pendingDerivedStatChoices);
                window.pendingRequirements = deduplicatedRequirements;
                return;
            }

            if (optimalBuild) {
                pendingOptimalBuild = optimalBuild;
                showTalentConfirmationModal(pendingTalentSelection.dependencyIds, optimalBuild, hasNewRequirements);
            } else {
                showNotification('No optimal build found with selected stats. Please try different choices.', 'warning');
                pendingTalentSelection = null;
            }
        } else if (!hasNewRequirements) {
            confirmTalentSelection();
        } else {
            showNotification('No optimal build found with selected stats. Please try different choices.', 'warning');
            pendingTalentSelection = null;
        }
    }
    // Add function to collect dependencies
    function collectDependencies(talentId, visited = new Set()) {
        if (visited.has(talentId)) {
            return;
        }
        visited.add(talentId);

        const talent = allTalents.find(t => t.id === talentId);
        if (!talent) {
            return;
        }

        const requiredTalentNames = getRequiredTalentNames(talent);

        requiredTalentNames.forEach(reqName => {
            const requiredTalent = findTalentByName(reqName);
            if (requiredTalent && !selectedTalents.has(requiredTalent.id)) {
                collectDependencies(requiredTalent.id, visited);
            }
        });
    }

    function deduplicateRequirements(requirements) {
        const deduplicated = {};

        for (const [statName, reqs] of Object.entries(requirements)) {
            deduplicated[statName] = [];

            // Group by condition type
            const anyReqs = reqs.filter(r => r.condition === 'any');
            const whileReqs = reqs.filter(r => r.condition === 'while');
            // FIX: Add filters for pre and post
            const preReqs = reqs.filter(r => r.condition === 'pre');
            const postReqs = reqs.filter(r => r.condition === 'post');

            // For ANY requirements, only keep the maximum value
            if (anyReqs.length > 0) {
                const maxAny = Math.max(...anyReqs.map(r => r.value));
                deduplicated[statName].push({
                    value: maxAny,
                    condition: 'any'
                });
            }

            // For WHILE requirements, deduplicate by talent group
            const whileGroups = {};
            whileReqs.forEach(req => {
                const group = req.talentGroup;
                if (!whileGroups[group] || whileGroups[group].value < req.value) {
                    whileGroups[group] = req;
                }
            });
            deduplicated[statName].push(...Object.values(whileGroups));

            // FIX: Pass through PRE requirements (keeping max value)
            if (preReqs.length > 0) {
                const maxPre = Math.max(...preReqs.map(r => r.value));
                deduplicated[statName].push({
                    value: maxPre,
                    condition: 'pre'
                });
            }

            // FIX: Pass through POST requirements (keeping max value)
            if (postReqs.length > 0) {
                const maxPost = Math.max(...postReqs.map(r => r.value));
                deduplicated[statName].push({
                    value: maxPost,
                    condition: 'post'
                });
            }
        }

        return deduplicated;
    }

    // Add function to calculate optimal build for talents
    function calculateOptimalBuildForTalents(talents) {
        const desiredStats = {};

        // Collect all requirements from all talents
        talents.forEach(talent => {
            const requirements = getTalentRequirements(talent);
            requirements.forEach(req => {
                if (!desiredStats[req.stat]) {
                    desiredStats[req.stat] = [];
                }
                // Use the maximum requirement for each stat
                const existingReq = desiredStats[req.stat].find(r => r.condition === 'any');
                if (existingReq) {
                    existingReq.value = Math.max(existingReq.value, req.value);
                } else {
                    desiredStats[req.stat].push({ value: req.value, condition: 'any' });
                }
            });
        });

        // Use the existing calculateOptimalOrder function
        return calculateOptimalOrder(desiredStats);
    }

    // Update the showTalentConfirmationModal function to show the actual shrine calculations
    function showTalentConfirmationModal(talentIds, optimalBuild) {
        const modal = document.getElementById('talentConfirmationModal');
        const messageEl = document.getElementById('talentConfirmationMessage');
        const talentsList = document.getElementById('selectedTalentsList');
        const buildComparisonSection = document.getElementById('buildComparisonSection');

        // Get current build stats
        const currentBuild = collectManualBuildStats();

        // Show talents being added
        const talentsToAdd = talentIds.map(id => allTalents.find(t => t.id === id)).filter(t => t);

        if (talentsToAdd.length === 1) {
            messageEl.textContent = `Adding "${talentsToAdd[0].name}" requires the following stats:`;
        } else {
            messageEl.textContent = `Adding these talents requires the following stats:`;
        }

        talentsList.innerHTML = '';
        talentsToAdd.forEach(talent => {
            const li = document.createElement('li');
            const requirements = getTalentRequirements(talent);

            if (requirements.length > 0) {
                // Filter out Power from display
                const displayRequirements = requirements.filter(r => !r.isPower);

                if (displayRequirements.length > 0) {
                    const reqText = displayRequirements.map(r => `${r.stat}: ${r.value}`).join(', ');
                    li.innerHTML = `<strong>${talent.name}</strong><br><span style="font-size: 0.85em; color: var(--card-text-secondary);">${reqText}</span>`;
                } else {
                    li.innerHTML = `<strong>${talent.name}</strong>`;
                }
            } else {
                li.textContent = talent.name;
            }

            talentsList.appendChild(li);
        });

        // Show build comparison
        buildComparisonSection.innerHTML = '';

        if (!optimalBuild) {
            buildComparisonSection.innerHTML = '<div class="no-changes-message">No optimal build could be calculated.</div>';
        } else {
            const comparisonDiv = document.createElement('div');
            comparisonDiv.className = 'build-comparison';

            // Current build column
            const currentColumn = document.createElement('div');
            currentColumn.className = 'build-column';
            currentColumn.innerHTML = '<h3>Current Stats</h3>';

            // Optimal build column
            const optimalColumn = document.createElement('div');
            optimalColumn.className = 'build-column';
            optimalColumn.innerHTML = '<h3>Optimal Stats</h3>';

            // Collect all unique stats (excluding Power)
            const allStats = new Set([
                ...Object.keys(currentBuild.pre),
                ...Object.keys(currentBuild.post),
                ...Object.keys(optimalBuild.preShrine || {}),
                ...Object.keys(optimalBuild.finalStats || {})
            ]);

            // Remove Power from the stats to display
            allStats.delete('Power');

            allStats.forEach(stat => {
                const currentPre = currentBuild.pre[stat] || 0;
                const currentPost = currentBuild.post[stat] || 0;

                const optimalPre = (optimalBuild.preShrine && optimalBuild.preShrine[stat]) ? optimalBuild.preShrine[stat].currentPre : 0;

                // Calculate the actual post-shrine value
                const postShrineValue = optimalBuild.postShrine[stat] || 0;
                const optimalFinal = optimalBuild.finalStats[stat] || 0;
                const additionalInvestment = optimalFinal - postShrineValue;

                // Show post-shrine value and additional investment separately
                let optimalPostDisplay;
                if (postShrineValue > 0 && additionalInvestment > 0) {
                    optimalPostDisplay = `${optimalFinal}`;
                } else if (postShrineValue > 0) {
                    optimalPostDisplay = `${Math.floor(postShrineValue)}`;
                } else {
                    optimalPostDisplay = `${optimalFinal}`;
                }

                const changed = false;

                // Current build stat
                const currentStatDiv = document.createElement('div');
                currentStatDiv.className = 'build-stat-item' + (changed ? ' changed' : '');
                currentStatDiv.innerHTML = `
                <span>${stat}:</span>
                <span>${currentPre} | ${currentPost}</span>
            `;
                currentColumn.appendChild(currentStatDiv);

                // Optimal build stat
                const optimalStatDiv = document.createElement('div');
                optimalStatDiv.className = 'build-stat-item' + (changed ? ' changed' : '');
                optimalStatDiv.innerHTML = `
                <span>${stat}:</span>
                <span>${optimalPre} | ${optimalPostDisplay}</span>
            `;
                optimalColumn.appendChild(optimalStatDiv);
            });

            comparisonDiv.appendChild(currentColumn);
            comparisonDiv.appendChild(optimalColumn);
            buildComparisonSection.appendChild(comparisonDiv);
        }

        modal.classList.add('active');
    }

    // Add function to confirm talent selection
    function confirmTalentSelection() {
        if (!pendingTalentSelection) return;

        // Add all pending talents
        pendingTalentSelection.dependencyIds.forEach(id => {
            selectedTalents.add(id);
        });

        // Apply optimal build if available
        if (pendingOptimalBuild) {
            applyOptimalBuildToStats(pendingOptimalBuild);
        }

        // Clear pending data
        pendingTalentSelection = null;
        pendingOptimalBuild = null;

        // Close modal and re-render
        document.getElementById('talentConfirmationModal').classList.remove('active');
        renderBothPanels();
    }

    // Add function to decline talent selection
    function declineTalentSelection() {
        // Clear pending data without adding talents
        pendingTalentSelection = null;
        pendingOptimalBuild = null;

        // Close modal
        document.getElementById('talentConfirmationModal').classList.remove('active');
    }

    function applyOptimalBuildToStats(solution) {
        // Clear all inputs first
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');
            preInput.value = 0;
            postInput.value = 0;
        });

        // Apply pre-shrine values
        for (const [statName, data] of Object.entries(solution.preShrine || {})) {
            const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${statName}"]`);
            if (statRow) {
                const preInput = statRow.querySelector('.pre-shrine');
                preInput.value = data.currentPre;
            }
        }

        // Apply post-shrine values directly from the solution
        // The solution already contains the correct postShrine values from simulateShrineAveragingOptimizer
        for (const [statName, finalValue] of Object.entries(solution.finalStats || {})) {
            const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${statName}"]`);
            if (statRow) {
                const postInput = statRow.querySelector('.post-shrine');
                const postShrineValue = solution.postShrine[statName] || 0;

                // If stat was in shrine, apply shrine result + additional investment
                if (postShrineValue > 0) {
                    const additionalInvestment = finalValue - postShrineValue;
                    postInput.value = postShrineValue + Math.max(0, additionalInvestment);
                } else {
                    // If stat wasn't in shrine, apply full final value
                    postInput.value = finalValue;
                }
            }
        }

        // Sync to optimizer for all stats
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');
            const preValue = parseInt(preInput.value) || 0;
            const postValue = parseInt(postInput.value) || 0;

            syncToOptimizer(statName, preValue, postValue);
        });

        updateSparePoints();
    }

    function unselectTalent(talentId) {
        // Check if any remaining talents depend on this one
        const dependentTalents = [];
        for (const selectedId of selectedTalents) {
            const talent = allTalents.find(t => t.id === selectedId);
            if (!talent) continue;

            const requiredNames = getRequiredTalentNames(talent);
            const removedTalent = allTalents.find(t => t.id === talentId);

            if (removedTalent && requiredNames.includes(removedTalent.name)) {
                dependentTalents.push(talent.name);
            }
        }

        // If there are dependent talents, show confirmation modal
        if (dependentTalents.length > 0) {
            const modal = document.getElementById('dependentTalentsModal');
            const message = document.getElementById('dependentTalentsMessage');
            const talentsList = document.getElementById('dependentTalentsList');
            const removedTalent = allTalents.find(t => t.id === talentId);

            message.textContent = `The following talents depend on "${removedTalent.name}". Removing this talent may make your build invalid.`;

            // Populate the dependent talents list
            talentsList.innerHTML = '';
            dependentTalents.forEach(talentName => {
                const li = document.createElement('li');
                li.textContent = talentName;
                talentsList.appendChild(li);
            });

            // Store the talent ID for the confirmation handler
            window.pendingTalentRemoval = talentId;

            modal.classList.add('active');
            return;
        }

        // No dependencies, proceed with removal
        proceedWithTalentRemoval(talentId);
    }


    function proceedWithTalentRemoval(talentId) {
        // Get the talent being removed
        const removedTalent = allTalents.find(t => t.id === talentId);

        // Check if the removed talent had any non-Power stat requirements
        const removedRequirements = removedTalent ?
            getTalentRequirements(removedTalent).filter(req => !req.isPower && req.stat !== 'Power') :
            [];

        // Remove the talent
        selectedTalents.delete(talentId);

        // Check if recalculation is needed
        let needsRecalculation = false;

        if (removedRequirements.length > 0) {
            // Get remaining talents
            const remainingTalents = Array.from(selectedTalents)
                .map(id => allTalents.find(t => t.id === id))
                .filter(t => t);

            // Check if any stat requirement from removed talent is not covered by remaining talents
            for (const removedReq of removedRequirements) {
                let isCovered = false;

                // Check remaining talents
                for (const talent of remainingTalents) {
                    const talentReqs = getTalentRequirements(talent);
                    const matchingReq = talentReqs.find(req => req.stat === removedReq.stat);

                    if (matchingReq && matchingReq.value >= removedReq.value) {
                        isCovered = true;
                        break;
                    }
                }

                // Also check equipped weapons
                if (!isCovered && equippedWeapons.length > 0) {
                    for (const weapon of equippedWeapons) {
                        const weaponReqs = getWeaponRequirements(weapon);
                        const matchingReq = weaponReqs.find(req => req.stat === removedReq.stat);

                        if (matchingReq && matchingReq.value >= removedReq.value) {
                            isCovered = true;
                            break;
                        }
                    }
                }

                // If this requirement isn't covered by anything else, we need to recalculate
                if (!isCovered) {
                    needsRecalculation = true;
                    break;
                }
            }
        }

        // Only recalculate if necessary
        if (needsRecalculation) {
            console.log('Recalculating build - removed talent had unique requirements');
            recalculateBuildForRemainingTalents();
        } else {
            console.log('Skipping recalculation - remaining talents/weapons cover all requirements');
        }

        // Re-render both panels
        renderBothPanels();

        if (removedTalent) {
            showNotification(`Removed "${removedTalent.name}" from your build`, 'success');
        }
    }


    function recalculateBuildForRemainingTalents() {
        // If no talents selected, clear the build
        if (selectedTalents.size === 0) {
            document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
                const preInput = row.querySelector('.pre-shrine');
                const postInput = row.querySelector('.post-shrine');
                preInput.value = 0;
                postInput.value = 0;
            });
            updateSparePoints();
            return;
        }

        // Get all remaining selected talents
        const remainingTalents = Array.from(selectedTalents)
            .map(id => allTalents.find(t => t.id === id))
            .filter(t => t);

        // Collect requirements from remaining talents
        const combinedRequirements = {};

        remainingTalents.forEach(talent => {
            const requirements = getTalentRequirements(talent);
            if (requirements.length === 0) return;

            // Check if this is an Oath talent
            const isOathTalent = talent.rarity === 'Oath' || (talent.reqs && talent.reqs.from && talent.reqs.from.includes('Oath:'));

            requirements.forEach(req => {
                // FILTER OUT POWER REQUIREMENTS
                if (req.isPower || req.stat === 'Power') return;

                if (!combinedRequirements[req.stat]) {
                    combinedRequirements[req.stat] = [];
                }

                // Oath talents always use POST-SHRINE
                if (isOathTalent) {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'post'
                    });
                } else if (requirements.filter(r => !r.isPower && r.stat !== 'Power').length === 1) {
                    // Only count non-Power requirements when checking if single requirement
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'any'
                    });
                } else {
                    combinedRequirements[req.stat].push({
                        value: req.value,
                        condition: 'while',
                        talentGroup: `talent_${talent.id}`,
                        allRequirements: requirements.filter(r => !r.isPower && r.stat !== 'Power')
                    });
                }
            });
        });

        // Deduplicate requirements
        const deduplicatedRequirements = deduplicateRequirements(combinedRequirements);

        // CHECK: If no actual requirements exist after filtering, just clear the build
        if (Object.keys(deduplicatedRequirements).length === 0) {
            console.log('No stat requirements remaining after filtering Power - clearing build');
            document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
                const preInput = row.querySelector('.pre-shrine');
                const postInput = row.querySelector('.post-shrine');
                preInput.value = 0;
                postInput.value = 0;
            });
            updateSparePoints();
            return;
        }

        // Calculate optimal build for remaining talents
        const optimalBuild = calculateOptimalOrder(deduplicatedRequirements);

        if (optimalBuild) {
            // Apply the new optimal build
            applyOptimalBuildToStats(optimalBuild);
            console.log('Build recalculated for remaining talents');
        } else {
            console.warn('Could not find optimal build for remaining talents');
        }
    }

    function matchesFilters(talent, activeFilters, currentStats) {
        // 1. Handle Availability Filters
        const wantsAvailable = activeFilters.has('available');
        const wantsUnavailable = activeFilters.has('unavailable');

        if (wantsAvailable || wantsUnavailable) {
            const available = isTalentAvailable(talent, currentStats);

            if (wantsAvailable && !available) return false;
            if (wantsUnavailable && available) return false;
        }

        // 2. Handle Stat Filters (existing logic)
        const statFilters = new Set([...activeFilters].filter(f => f !== 'available' && f !== 'unavailable'));

        if (statFilters.size === 0) return true;

        const requirements = getTalentRequirements(talent);
        const talentStats = new Set(requirements.map(req => req.stat));

        // Talent must have ALL of the active stat filters (AND logic)
        for (const filter of statFilters) {
            if (!talentStats.has(filter)) {
                return false;
            }
        }

        return true;
    }

    function matchesSearch(talent, searchTerm) {
        if (!searchTerm) return true;

        const term = searchTerm.toLowerCase();
        return (
            talent.name.toLowerCase().includes(term) ||
            (talent.desc && talent.desc.toLowerCase().includes(term)) ||
            (talent.category && talent.category.toLowerCase().includes(term))
        );
    }

    function renderAvailableTalents() {
        const container = document.getElementById('availableTalents');
        const searchTerm = document.getElementById('searchAvailable').value;
        const currentStats = getCurrentMaxBuildStats();

        // Filter out selected talents
        let available = allTalents.filter(t => !selectedTalents.has(t.id));

        // Apply rarity filter
        available = filterByRarity(available);

        if (available.length === 0) {
            container.innerHTML = '<p class="empty-message">All talents selected</p>';
            return;
        }

        container.innerHTML = '';

        let visibleCount = 0;

        // Sort the talents before rendering
        available = sortTalents(available, availableSortBy, availableSortOrder);

        available.forEach(talent => {
            const card = createTalentCard(talent, false);

            const matchesFilter = matchesFilters(talent, availableFilters, currentStats);
            const matchesSearchTerm = matchesSearch(talent, searchTerm);

            if (!matchesFilter || !matchesSearchTerm) {
                card.classList.add('hidden');
            } else {
                visibleCount++;
            }

            container.appendChild(card);
        });

        if (visibleCount === 0) {
            container.innerHTML = '<p class="empty-message">No talents match your filters</p>';
        }
    }


    function renderSelectedTalents() {
        const container = document.getElementById('selectedTalents');
        const searchTerm = document.getElementById('searchSelected').value;
        const currentStats = {};

        let selected = allTalents.filter(t => selectedTalents.has(t.id));

        if (selected.length === 0) {
            container.innerHTML = '<p class="empty-message">No talents selected</p>';
            return;
        }

        container.innerHTML = '';

        let visibleCount = 0;

        // Sort the selected talents before rendering
        selected = sortTalents(selected, selectedSortBy, selectedSortOrder);

        selected.forEach(talent => {
            const card = createTalentCard(talent, true);

            const matchesFilter = matchesFilters(talent, selectedFilters);
            const matchesSearchTerm = matchesSearch(talent, searchTerm);

            if (!matchesFilter || !matchesSearchTerm) {
                card.classList.add('hidden');
            } else {
                visibleCount++;
            }

            container.appendChild(card);
        });

        if (visibleCount === 0) {
            container.innerHTML = '<p class="empty-message">No selected talents match your filters</p>';
        }
    }

    function renderBothPanels() {
        renderAvailableTalents();
        renderSelectedTalents();
    }


    // ==========================================
    // STAT ORDER TAB
    // ==========================================

    document.getElementById('generateStatOrder').addEventListener('click', () => {
        if (selectedTalents.size === 0) {
            document.getElementById('preOrderContent').innerHTML = `
            <div class="no-talents-warning">
                <strong>No Talents Selected</strong>
                <p>Please select talents in the Talents tab first, then generate the stat order.</p>
            </div>
        `;
            document.getElementById('postOrderContent').innerHTML = `
            <div class="no-talents-warning">
                <strong>No Talents Selected</strong>
                <p>Please select talents in the Talents tab first, then generate the stat order.</p>
            </div>
        `;
            return;
        }

        const currentBuild = collectManualBuildStats();
        const statOrders = calculateSplitStatOrder(currentBuild);
        displaySplitStatOrder(statOrders);
    });

    function calculateSplitStatOrder(currentBuild) {
        // Get all selected talents, excluding those that don't count towards total
        const talents = Array.from(selectedTalents)
            .map(id => allTalents.find(t => t.id === id))
            .filter(t => t && !t.dontCountTowardsTotal);

        // If no talents after filtering, return empty orders
        if (talents.length === 0) {
            return {
                preShrine: {
                    talents: [],
                    order: {
                        steps: [],
                        finalStats: {},
                        totalPoints: 0,
                        immediateTalents: []
                    },
                    targetStats: currentBuild.pre
                },
                postShrine: {
                    talents: [],
                    order: {
                        steps: [],
                        finalStats: {},
                        totalPoints: 0,
                        immediateTalents: []
                    },
                    startingStats: {},
                    targetStats: currentBuild.post
                }
            };
        }

        // 1. Define Target Pre-Shrine Stats
        const preShrineStats = { ...currentBuild.pre };

        // 2. Separate talents into pre-shrine and post-shrine logic
        // IMPORTANT: Check if the talent AND all its prerequisites are selected
        const preShrineTalents = [];
        const postShrineTalents = [];

        talents.forEach(talent => {
            const requirements = getAllRequirementsForStatOrder(talent);
            const prerequisites = getPrerequisiteTalents(talent);

            // Check if all prerequisites are also selected
            const allPrerequisitesSelected = prerequisites.every(prereq =>
                selectedTalents.has(prereq.id)
            );

            if (requirements.length === 0) {
                // No requirements - available immediately (Pre-Shrine)
                preShrineTalents.push(talent);
            } else if (allPrerequisitesSelected) {
                // All prerequisites are selected, check if requirements can be met pre-shrine.
                // Power requirements are checked against the pre-shrine point total, not a stat field.
                const preShrinePower = getPowerFromStatTotal(preShrineStats);
                const canGetPreShrine = requirements.every(req => {
                    if (req.isPower || req.stat === 'Power') {
                        return preShrinePower >= req.value;
                    }
                    return (preShrineStats[req.stat] || 0) >= req.value;
                });

                if (canGetPreShrine) {
                    preShrineTalents.push(talent);
                } else {
                    postShrineTalents.push(talent);
                }
            } else {
                // Prerequisites not selected, push to post-shrine
                postShrineTalents.push(talent);
            }
        });

        // 3. Calculate optimal order for Pre-Shrine talents
        // Starting stats are 0 (or empty)
        const preOrder = calculateOrderForPhase(preShrineTalents, {});

        // 4. Calculate actual starting stats for Post-Shrine (The Shrined Stats)
        // We need to convert the simple preShrineStats object to the format expected by simulateShrineAveraging
        const optimizerStatsFormat = {};
        for (const [stat, value] of Object.entries(preShrineStats)) {
            if (value > 0) {
                optimizerStatsFormat[stat] = { currentPre: value };
            }
        }

        // Simulate the shrine drop to get the actual starting values for Phase 2
        const shrineResults = simulateShrineAveraging(optimizerStatsFormat);
        const postShrineStartingStats = shrineResults.postShrine;

        // 5. Calculate optimal order for Post-Shrine talents
        // Starting stats are the results of the Shrine
        const postOrder = calculateOrderForPhase(postShrineTalents, postShrineStartingStats);

        return {
            preShrine: {
                talents: preShrineTalents,
                order: preOrder,
                targetStats: preShrineStats
            },
            postShrine: {
                talents: postShrineTalents,
                order: postOrder,
                startingStats: postShrineStartingStats,
                targetStats: currentBuild.post
            }
        };
    }

    function calculateOrderForPhase(talents, startingStats) {
        if (talents.length === 0) {
            return {
                steps: [],
                finalStats: { ...startingStats },
                totalPoints: 0,
                immediateTalents: []
            };
        }

        // Build a map of stat requirements to talents
        const talentsByRequirement = new Map();

        talents.forEach(talent => {
            // Use the function that resolves Body/Mind
            const requirements = getAllRequirementsForStatOrder(talent);

            if (requirements.length === 0) {
                if (!talentsByRequirement.has('immediate')) {
                    talentsByRequirement.set('immediate', []);
                }
                talentsByRequirement.get('immediate').push({
                    talent: talent,
                    requirements: []
                });
            } else {
                const reqKey = requirements
                    .map(r => `${r.stat}:${r.value}`)
                    .sort()
                    .join('|');

                if (!talentsByRequirement.has(reqKey)) {
                    talentsByRequirement.set(reqKey, []);
                }

                talentsByRequirement.get(reqKey).push({
                    talent: talent,
                    requirements: requirements
                });
            }
        });

        const statOrder = [];
        const currentStats = { ...startingStats };
        const unlockedTalents = new Set();

        // Initialize all stats to starting values
        const allStatNames = [
            'Strength', 'Fortitude', 'Agility', 'Intelligence', 'Willpower', 'Charisma',
            'Heavy Wep.', 'Medium Wep.', 'Light Wep.',
            'Flamecharm', 'Frostdraw', 'Thundercall', 'Galebreathe', 'Shadowcast', 'Ironsing', 'Bloodrend'
        ];

        allStatNames.forEach(stat => {
            if (currentStats[stat] === undefined) {
                currentStats[stat] = 0;
            }
        });

        // Handle immediate talents
        const immediateTalents = talentsByRequirement.get('immediate') || [];
        if (immediateTalents.length > 0) {
            immediateTalents.forEach(item => {
                unlockedTalents.add(item.talent.id);
            });
        }

        // Build priority queue
        const priorityQueue = [];

        talentsByRequirement.forEach((talentGroup, reqKey) => {
            if (reqKey === 'immediate') return;

            const firstTalent = talentGroup[0];
            const requirements = firstTalent.requirements;

            const calculateCost = (stats) => {
                return requirements.reduce((sum, req) => {
                    const needed = Math.max(0, req.value - (stats[req.stat] || 0));
                    return sum + needed;
                }, 0);
            };

            const value = talentGroup.length;

            priorityQueue.push({
                requirements: requirements,
                talents: talentGroup,
                getValue: () => value / Math.max(1, calculateCost(currentStats)),
                getCost: () => calculateCost(currentStats)
            });
        });

        // Process investments
        let stepNumber = 1;
        let totalPointsSpent = Object.values(currentStats).reduce((a, b) => a + b, 0) -
            Object.values(startingStats).reduce((a, b) => a + b, 0);

        while (priorityQueue.length > 0) {
            priorityQueue.sort((a, b) => b.getValue() - a.getValue());

            const nextGroup = priorityQueue[0];
            let bestStat = null;
            let bestStatValue = -Infinity;

            nextGroup.requirements.forEach(req => {
                const currentValue = currentStats[req.stat] || 0;
                if (currentValue < req.value) {
                    const talentsUnlockedByThisStat = priorityQueue.filter(group =>
                        group.requirements.some(r => r.stat === req.stat && (currentStats[req.stat] || 0) < r.value)
                    ).length;

                    if (talentsUnlockedByThisStat > bestStatValue) {
                        bestStatValue = talentsUnlockedByThisStat;
                        bestStat = req.stat;
                    }
                }
            });

            if (!bestStat) {
                priorityQueue.shift();
                continue;
            }

            currentStats[bestStat] = (currentStats[bestStat] || 0) + 1;
            totalPointsSpent += 1;

            const newlyUnlocked = [];

            for (let i = priorityQueue.length - 1; i >= 0; i--) {
                const group = priorityQueue[i];
                const allReqsMet = group.requirements.every(req =>
                    (currentStats[req.stat] || 0) >= req.value
                );

                if (allReqsMet) {
                    group.talents.forEach(item => {
                        if (!unlockedTalents.has(item.talent.id)) {
                            newlyUnlocked.push(item.talent);
                            unlockedTalents.add(item.talent.id);
                        }
                    });
                    priorityQueue.splice(i, 1);
                }
            }

            statOrder.push({
                step: stepNumber++,
                stat: bestStat,
                value: currentStats[bestStat],
                pointsSpent: 1,
                totalPointsSpent: totalPointsSpent,
                unlockedTalents: newlyUnlocked
            });
        }

        return {
            steps: statOrder,
            finalStats: currentStats,
            totalPoints: totalPointsSpent,
            immediateTalents: immediateTalents.map(item => item.talent)
        };
    }

    function displaySplitStatOrder(statOrders) {
        // Check if there are any talents that count towards the total
        const totalTalents = statOrders.preShrine.talents.length + statOrders.postShrine.talents.length;

        if (totalTalents === 0) {
            // Check if user has selected talents at all
            if (selectedTalents.size > 0) {
                // They have talents, but all are auto-unlocked
                document.getElementById('preOrderContent').innerHTML = `
                <div class="no-talents-warning">
                    <strong>All Selected Talents Auto-Unlock</strong>
                    <p>The talents you've selected don't require stat investments (e.g., Shadowcaster, Flamecharm).</p>
                    <p>These talents are automatically unlocked and don't need a stat order.</p>
                </div>
            `;
                document.getElementById('postOrderContent').innerHTML = `
                <div class="no-talents-warning">
                    <strong>All Selected Talents Auto-Unlock</strong>
                    <p>The talents you've selected don't require stat investments (e.g., Shadowcaster, Flamecharm).</p>
                    <p>These talents are automatically unlocked and don't need a stat order.</p>
                </div>
            `;
            } else {
                // No talents selected at all
                document.getElementById('preOrderContent').innerHTML = `
                <div class="no-talents-warning">
                    <strong>No Talents Selected</strong>
                    <p>Please select talents in the Talents tab first, then generate the stat order.</p>
                </div>
            `;
                document.getElementById('postOrderContent').innerHTML = `
                <div class="no-talents-warning">
                    <strong>No Talents Selected</strong>
                    <p>Please select talents in the Talents tab first, then generate the stat order.</p>
                </div>
            `;
            }
            return;
        }

        displayPhaseOrder(statOrders.preShrine, 'preOrderContent', true);
        displayPhaseOrder(statOrders.postShrine, 'postOrderContent', false);
    }

    function displayPhaseOrder(phaseData, containerId, isPreShrine) {
        const container = document.getElementById(containerId);

        if (phaseData.talents.length === 0) {
            container.innerHTML = `
            <p class="empty-message">No talents unlockable in this phase</p>
        `;
            return;
        }

        let html = '';

        // Merge consecutive steps BEFORE displaying summary
        const mergedSteps = mergeConsecutiveSteps(phaseData.order.steps);

        // Summary section - use mergedSteps.length instead of phaseData.order.steps.length
        html += `
        <div class="stat-order-summary">
            <h4>Summary</h4>
            <div class="summary-stats">
                <div class="summary-stat-item">
                    <span>Talents:</span>
                    <strong>${phaseData.talents.length}</strong>
                </div>
                <div class="summary-stat-item">
                    <span>Points Required:</span>
                    <strong>${phaseData.order.totalPoints}</strong>
                </div>
                <div class="summary-stat-item">
                    <span>Investment Steps:</span>
                    <strong>${mergedSteps.length}</strong>
                </div>
                <div class="summary-stat-item">
                    <span>Immediate Talents:</span>
                    <strong>${phaseData.order.immediateTalents.length}</strong>
                </div>
            </div>
        </div>
    `;

        // Immediate talents
        if (phaseData.order.immediateTalents.length > 0) {
            html += `
            <div class="stat-order-step">
                <div class="step-number">0</div>
                <div class="step-action">
                    <span class="step-stat-name">${isPreShrine ? 'Starting Talents' : 'Available After Shrine'}</span>
                    <span class="step-stat-value">No additional requirements</span>
                </div>
                <div class="step-unlocks">
                    ${phaseData.order.immediateTalents.map(t =>
                `<div class="unlock-item">+ ${t.name}</div>`
            ).join('')}
                </div>
            </div>
        `;
        }

        // Timeline
        html += '<div class="stat-order-timeline">';

        mergedSteps.forEach((step, index) => {
            const hasUnlocks = step.unlockedTalents.length > 0;

            html += `
            <div class="stat-order-step">
                <div class="step-number">${index + 1}</div>
                <div class="step-action">
                    <span class="step-stat-name">${step.stat}</span>
                    <span class="step-stat-value">
                        ${step.startValue > 0 ? `${step.startValue} → ${step.endValue}` : `Invest to ${step.endValue}`}
                        <span class="step-cost">(+${step.totalPoints} point${step.totalPoints > 1 ? 's' : ''})</span>
                    </span>
                </div>
                ${hasUnlocks ? `
                <div class="step-unlocks">
                    ${step.unlockedTalents.map(t =>
                `<div class="unlock-item">+ ${t.name} (${findTalentCategory(t.name)})</div>`
            ).join('')}
                </div>
                ` : ''}
            </div>
        `;
        });

        html += '</div>';

        // Final stats
        const statsToShow = Object.entries(phaseData.order.finalStats)
            .filter(([stat, value]) => value > 0)
            .sort((a, b) => b[1] - a[1]);

        if (statsToShow.length > 0) {
            html += `
            <div class="stat-totals">
                <h4>Final Stat Distribution</h4>
                <div class="totals-grid">
        `;

            statsToShow.forEach(([stat, value]) => {
                html += `
                <div class="total-stat-item">
                    <span class="total-stat-name">${stat}</span>
                    <span class="total-stat-value">${value}</span>
                </div>
            `;
            });

            html += `
                </div>
            </div>
        `;
        }

        container.innerHTML = html;
    }


    function mergeConsecutiveSteps(steps) {
        if (steps.length === 0) return [];

        const merged = [];
        let currentGroup = {
            stat: steps[0].stat,
            startValue: steps[0].value - 1,
            endValue: steps[0].value,
            totalPoints: steps[0].pointsSpent,
            unlockedTalents: [...steps[0].unlockedTalents]
        };

        for (let i = 1; i < steps.length; i++) {
            const step = steps[i];

            // If same stat and no talents unlocked in current group, merge
            if (step.stat === currentGroup.stat && currentGroup.unlockedTalents.length === 0) {
                currentGroup.endValue = step.value;
                currentGroup.totalPoints += step.pointsSpent;
                currentGroup.unlockedTalents.push(...step.unlockedTalents);
            } else {
                // Different stat or talents were unlocked, start new group
                merged.push(currentGroup);
                currentGroup = {
                    stat: step.stat,
                    startValue: step.value - 1,
                    endValue: step.value,
                    totalPoints: step.pointsSpent,
                    unlockedTalents: [...step.unlockedTalents]
                };
            }
        }

        // Don't forget the last group
        merged.push(currentGroup);

        return merged;
    }

    // Setup filter buttons
    function setupFilterButtons(containerId, filterSet) {
        const container = document.getElementById(containerId);
        const filterButtons = container.querySelectorAll('.filter-btn:not(.clear-filters)');
        const clearButton = container.querySelector('.clear-filters');

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.getAttribute('data-filter');

                if (filterSet.has(filter)) {
                    filterSet.delete(filter);
                    button.classList.remove('active');
                } else {
                    filterSet.add(filter);
                    button.classList.add('active');
                }

                renderBothPanels();
            });
        });

        clearButton.addEventListener('click', () => {
            filterSet.clear();
            filterButtons.forEach(btn => btn.classList.remove('active'));
            renderBothPanels();
        });
    }




    // Setup search bars
    document.getElementById('searchAvailable').addEventListener('input', () => {
        renderAvailableTalents();
    });

    document.getElementById('searchSelected').addEventListener('input', () => {
        renderSelectedTalents();
    });

    // Setup rarity toggles
    document.getElementById('toggleOrigin').addEventListener('change', (e) => {
        showOriginTalents = e.target.checked;
        renderAvailableTalents();
    });

    document.getElementById('toggleQuest').addEventListener('change', (e) => {
        showQuestTalents = e.target.checked;
        renderAvailableTalents();
    });

    document.getElementById('toggleOath').addEventListener('change', (e) => {
        showOathTalents = e.target.checked;
        renderAvailableTalents();
    });

    document.getElementById('toggleEquipment').addEventListener('change', (e) => {
        showEquipmentTalents = e.target.checked;
        renderAvailableTalents();
    });

    document.getElementById('toggleOutfit').addEventListener('change', (e) => {
        showOutfitTalents = e.target.checked;
        renderAvailableTalents();
    });

    // Setup sort controls for available talents
    document.getElementById('sortBy').addEventListener('change', (e) => {
        availableSortBy = e.target.value;
        renderAvailableTalents();
    });

    document.getElementById('sortOrder').addEventListener('change', (e) => {
        availableSortOrder = e.target.value;
        renderAvailableTalents();
    });

    // Setup sort controls for selected talents
    document.getElementById('sortBySelected').addEventListener('change', (e) => {
        selectedSortBy = e.target.value;
        renderSelectedTalents();
    });

    document.getElementById('sortOrderSelected').addEventListener('change', (e) => {
        selectedSortOrder = e.target.value;
        renderSelectedTalents();
    });

    document.getElementById('confirmBuildBtn').addEventListener('click', confirmTalentSelection);
    document.getElementById('declineBuildBtn').addEventListener('click', declineTalentSelection);

    // Close modal when clicking outside
    document.getElementById('talentConfirmationModal').addEventListener('click', (e) => {
        if (e.target.id === 'talentConfirmationModal') {
            declineTalentSelection();
        }
    });

    document.querySelectorAll('#stats-tab .simple-input').forEach(input => {
        input.addEventListener('input', () => {
            updateSparePoints();
        });

        input.addEventListener('input', () => {
            // Only re-render if we're on the weapons tab
            const weaponsTab = document.getElementById('weapons-tab');
            if (weaponsTab.classList.contains('active')) {
                renderAvailableWeapons();
            }
        });

        input.addEventListener('blur', () => {
            // Also re-render on blur (when user finishes editing)
            const weaponsTab = document.getElementById('weapons-tab');
            if (weaponsTab.classList.contains('active')) {
                renderAvailableWeapons();
            }
        });
    });

    // Dependent Talents Modal Handlers
    document.getElementById('confirmRemoveTalentBtn')?.addEventListener('click', () => {
        const talentId = window.pendingTalentRemoval;
        if (talentId) {
            proceedWithTalentRemoval(talentId);
            window.pendingTalentRemoval = null;
        }
        document.getElementById('dependentTalentsModal').classList.remove('active');
    });

    document.getElementById('declineRemoveTalentBtn')?.addEventListener('click', () => {
        const talentId = window.pendingTalentRemoval;
        if (talentId) {
            // Re-add the talent if user cancels
            selectedTalents.add(talentId);
            renderBothPanels();
            window.pendingTalentRemoval = null;
        }
        document.getElementById('dependentTalentsModal').classList.remove('active');
    });

    // Close modal when clicking outside
    document.getElementById('dependentTalentsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'dependentTalentsModal') {
            const talentId = window.pendingTalentRemoval;
            if (talentId) {
                // Re-add the talent if user cancels
                selectedTalents.add(talentId);
                renderBothPanels();
                window.pendingTalentRemoval = null;
            }
            document.getElementById('dependentTalentsModal').classList.remove('active');
        }
    });


    document.getElementById('sortBy').value = availableSortBy;
    document.getElementById('sortOrder').value = availableSortOrder;
    document.getElementById('sortBySelected').value = selectedSortBy;
    document.getElementById('sortOrderSelected').value = selectedSortOrder;

    function showDerivedStatSelectionModal(choices) {
        const modal = document.getElementById('derivedStatModal');
        const messageEl = document.getElementById('derivedStatMessage');
        const choicesContainer = document.getElementById('derivedStatChoices');

        // Use innerHTML instead of textContent to allow HTML formatting
        messageEl.innerHTML = `
        <p style="margin-bottom: 12px;">Some talents require Body or Mind stats. Please choose which attribute to invest in:</p>
        <div style="background-color: rgba(255, 165, 0, 0.2); border-left: 3px solid #ff8c00; padding: 10px; margin-bottom: 15px;">
            <span style="color: var(--card-text-primary);">This selection will be overridden if you later add talents or weapons with specific STR/FTD/AGI or INT/WIL/CHAR requirements. The optimizer will automatically use the stat with the highest existing value.</span>
        </div>
    `;

        choicesContainer.innerHTML = '';

        choices.forEach((choice, index) => {
            const choiceDiv = document.createElement('div');
            choiceDiv.className = 'derived-stat-choice';
            choiceDiv.style.cssText = 'margin: 15px 0; padding: 15px; background: var(--input-background); border: 1px solid var(--border-color);';

            choiceDiv.innerHTML = `
            <div style="margin-bottom: 10px;">
                <strong>${choice.derivedStat} requirement: ${choice.value}</strong>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <label>Invest in:</label>
                <select id="derivedChoice${index}" class="derived-stat-select" style="flex: 1;">
                    ${choice.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
            </div>
        `;

            choicesContainer.appendChild(choiceDiv);
        });

        modal.classList.add('active');
    }

    // Add event listener for confirming derived stat choices
    document.getElementById('confirmDerivedStats')?.addEventListener('click', () => {
        const choices = window.pendingDerivedStatChoices;
        if (!choices) return;

        // Collect user selections
        const selectedStats = {};
        choices.forEach((choice, index) => {
            const select = document.getElementById(`derivedChoice${index}`);
            selectedStats[choice.derivedStat] = select.value;
        });

        console.log('User selected derived stats:', selectedStats);

        // Store selections for the optimizer to use
        window.selectedDerivedStats = selectedStats;

        // Clear the choices array
        window.pendingDerivedStatChoices = [];

        // Close modal
        document.getElementById('derivedStatModal').classList.remove('active');

        // Proceed with calculation
        proceedWithDerivedStatChoices();
    });

    function proceedWithDerivedStatChoices() {
        if (!window.pendingRequirements) {
            console.error('No pending requirements found');
            return;
        }

        console.log('Proceeding with derived stat choices:', window.selectedDerivedStats);

        // Recalculate with user's selections
        const optimalBuild = calculateOptimalOrder(window.pendingRequirements);

        if (optimalBuild) {
            // Check if this is for weapon equip or talent selection
            if (window.pendingWeaponEquip) {
                // Handle weapon equip flow
                if (pendingWeaponSelection) {
                    pendingWeaponOptimalBuild = optimalBuild; // Set weapon-specific variable
                    showWeaponConfirmationModal(pendingWeaponSelection, optimalBuild);
                }
                window.pendingWeaponEquip = false;
            } else {
                // Handle talent selection flow
                pendingOptimalBuild = optimalBuild; // Set talent-specific variable

                if (pendingTalentSelection) {
                    const hasNewRequirements = pendingTalentSelection.dependencyIds
                        .map(id => allTalents.find(t => t.id === id))
                        .filter(t => t)
                        .some(talent => getTalentRequirements(talent).length > 0);

                    showTalentConfirmationModal(
                        pendingTalentSelection.dependencyIds,
                        optimalBuild,
                        hasNewRequirements
                    );
                }
            }
        } else {
            showNotification('No optimal build found with selected stats. Please try different choices.', 'warning');
        }

        // Clean up
        window.pendingRequirements = null;
    }

    // ==========================================
    // IMPORT FROM DEEPWOKEN BUILDER
    // ==========================================

    // Open import modal
    document.getElementById('openImportModalBtn')?.addEventListener('click', () => {
        document.getElementById('importBuildModal').classList.add('active');
    });

    // Close modal when clicking outside
    document.getElementById('importBuildModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'importBuildModal') {
            document.getElementById('importBuildModal').classList.remove('active');
        }
    });

    // Open API link in new tab
    document.getElementById('openApiBtn')?.addEventListener('click', () => {
        const input = document.getElementById('buildIdInput');
        const rawInput = input.value.trim();

        if (!rawInput) {
            showNotification('Please enter a build ID or URL', 'warning');
            return;
        }

        // Extract build ID from input
        let buildId = rawInput;

        // Check if it's a full URL
        if (rawInput.includes('deepwoken.co/builder')) {
            const match = rawInput.match(/[?&]id=([^&]+)/);
            if (match) {
                buildId = match[1];
            } else {
                showNotification('Could not extract build ID from URL', 'error');
                return;
            }
        }

        // Validate build ID format (basic check)
        if (!buildId || buildId.length < 5) {
            showNotification('Invalid build ID format', 'error');
            return;
        }

        // Construct the API URL
        const apiUrl = `https://deepwoken.co/api/proxy?url=${encodeURIComponent(`https://api.deepwoken.co/build?id=${buildId}`)}&options=%7B%7D`;

        // Open in new tab
        window.open(apiUrl, '_blank');

        showNotification('API page opened! Copy the JSON data and paste it below.', 'info', 6000);
    });

    // Import from JSON
    document.getElementById('importFromJsonBtn')?.addEventListener('click', () => {
        const jsonInput = document.getElementById('buildJsonInput');
        const jsonText = jsonInput.value.trim();

        if (!jsonText) {
            showNotification('Please paste the JSON data', 'warning');
            return;
        }

        try {
            // Parse JSON
            const buildData = JSON.parse(jsonText);

            // Validate that it looks like build data
            if (!buildData.stats && !buildData.talents) {
                throw new Error('Invalid build data: missing stats or talents');
            }

            // Import the build
            importBuildData(buildData);

            // Close modal and clear inputs
            document.getElementById('importBuildModal').classList.remove('active');
            document.getElementById('buildIdInput').value = '';
            document.getElementById('buildJsonInput').value = '';

            showNotification('Build imported successfully!', 'success');

        } catch (error) {
            console.error('Error parsing JSON:', error);
            showNotification('Invalid JSON data. Please make sure you copied the entire page content.', 'error');
        }
    });

    // Allow Enter key in build ID input
    document.getElementById('buildIdInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('openApiBtn').click();
        }
    });

    function importBuildData(buildData) {
        console.log('Importing build data:', buildData);

        // Mapping from Deepwoken Builder stat names to our stat names
        const statMapping = {
            'Strength': 'Strength',
            'Fortitude': 'Fortitude',
            'Agility': 'Agility',
            'Intelligence': 'Intelligence',
            'Willpower': 'Willpower',
            'Charisma': 'Charisma',
            'Heavy Wep.': 'Heavy Wep.',
            'Medium Wep.': 'Medium Wep.',
            'Light Wep.': 'Light Wep.',
            'Flamecharm': 'Flamecharm',
            'Frostdraw': 'Frostdraw',
            'Thundercall': 'Thundercall',
            'Galebreathe': 'Galebreathe',
            'Shadowcast': 'Shadowcast',
            'Ironsing': 'Ironsing',
            'Bloodrend': 'Bloodrend'
        };

        // Clear all current stats
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');
            preInput.value = 0;
            postInput.value = 0;
        });

        // Clear selected talents and equipped weapons
        selectedTalents.clear();
        equippedWeapons = [];

        // Import stats from the attributes object structure
        if (buildData.attributes) {
            // Import base stats (Strength, Fortitude, etc.)
            if (buildData.attributes.base) {
                Object.entries(buildData.attributes.base).forEach(([statName, value]) => {
                    const ourStatName = statMapping[statName];
                    if (ourStatName && value > 0) {
                        const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${ourStatName}"]`);
                        if (statRow) {
                            const postInput = statRow.querySelector('.post-shrine');
                            postInput.value = value;
                        }
                    }
                });
            }

            // Import weapon stats
            if (buildData.attributes.weapon) {
                Object.entries(buildData.attributes.weapon).forEach(([statName, value]) => {
                    const ourStatName = statMapping[statName];
                    if (ourStatName && value > 0) {
                        const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${ourStatName}"]`);
                        if (statRow) {
                            const postInput = statRow.querySelector('.post-shrine');
                            postInput.value = value;
                        }
                    }
                });
            }

            // Import attunement stats
            if (buildData.attributes.attunement) {
                Object.entries(buildData.attributes.attunement).forEach(([statName, value]) => {
                    const ourStatName = statMapping[statName];
                    if (ourStatName && value > 0) {
                        const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${ourStatName}"]`);
                        if (statRow) {
                            const postInput = statRow.querySelector('.post-shrine');
                            postInput.value = value;
                        }
                    }
                });
            }
        }

        // Also support preShrine data if available (for the pre-shrine column)
        if (buildData.preShrine) {
            // Import base stats
            if (buildData.preShrine.base) {
                Object.entries(buildData.preShrine.base).forEach(([statName, value]) => {
                    const ourStatName = statMapping[statName];
                    if (ourStatName && value > 0) {
                        const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${ourStatName}"]`);
                        if (statRow) {
                            const preInput = statRow.querySelector('.pre-shrine');
                            preInput.value = value;
                        }
                    }
                });
            }

            // Import weapon stats
            if (buildData.preShrine.weapon) {
                Object.entries(buildData.preShrine.weapon).forEach(([statName, value]) => {
                    const ourStatName = statMapping[statName];
                    if (ourStatName && value > 0) {
                        const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${ourStatName}"]`);
                        if (statRow) {
                            const preInput = statRow.querySelector('.pre-shrine');
                            preInput.value = value;
                        }
                    }
                });
            }

            // Import attunement stats
            if (buildData.preShrine.attunement) {
                Object.entries(buildData.preShrine.attunement).forEach(([statName, value]) => {
                    const ourStatName = statMapping[statName];
                    if (ourStatName && value > 0) {
                        const statRow = document.querySelector(`#stats-tab .stat-row.simple[data-stat="${ourStatName}"]`);
                        if (statRow) {
                            const preInput = statRow.querySelector('.pre-shrine');
                            preInput.value = value;
                        }
                    }
                });
            }
        }

        // Import talents
        let importedTalentCount = 0;
        let notFoundTalentCount = 0;
        const notFoundTalents = [];

        if (buildData.talents && Array.isArray(buildData.talents)) {
            buildData.talents.forEach(talentName => {
                // Find talent by name (case-insensitive)
                const talent = allTalents.find(t =>
                    t.name.toLowerCase() === talentName.toLowerCase()
                );

                if (talent) {
                    selectedTalents.add(talent.id);
                    importedTalentCount++;
                } else {
                    console.warn(`Talent not found: ${talentName}`);
                    notFoundTalents.push(talentName);
                    notFoundTalentCount++;
                }
            });
        }

        // Import weapon
        let importedWeaponCount = 0;
        let notFoundWeapons = [];

        if (buildData.weapons) {
            // Handle both string and array formats
            const weaponNames = Array.isArray(buildData.weapons) ? buildData.weapons : [buildData.weapons];

            weaponNames.forEach(weaponName => {
                if (!weaponName || weaponName === 'None' || weaponName === '') return;

                // Find weapon by name (case-insensitive)
                const weapon = allWeapons.find(w =>
                    w.name.toLowerCase() === weaponName.toLowerCase()
                );

                if (weapon) {
                    equippedWeapons.push(weapon);
                    importedWeaponCount++;
                    console.log(`Equipped weapon: ${weapon.name}`);
                } else {
                    console.warn(`Weapon not found: ${weaponName}`);
                    notFoundWeapons.push(weaponName);
                }
            });
        }

        // Sync all stats to optimizer
        document.querySelectorAll('#stats-tab .stat-row.simple').forEach(row => {
            const statName = row.getAttribute('data-stat');
            const preInput = row.querySelector('.pre-shrine');
            const postInput = row.querySelector('.post-shrine');
            const preValue = parseInt(preInput.value) || 0;
            const postValue = parseInt(postInput.value) || 0;

            syncToOptimizer(statName, preValue, postValue);
        });

        // Update spare points
        updateSparePoints();

        // Re-render talents and weapons
        renderBothPanels();
        renderAvailableWeapons();

        console.log(`Imported ${importedTalentCount} talents, ${selectedTalents.size} total selected`);
        console.log(`Imported ${importedWeaponCount} weapons`);

        // Build notification message
        let message = `Imported ${importedTalentCount} talents`;
        if (importedWeaponCount > 0) {
            message += `, ${importedWeaponCount} weapon(s)`;
        }

        const totalNotFound = notFoundTalentCount + notFoundWeapons.length;
        if (totalNotFound > 0) {
            console.log('Talents not found:', notFoundTalents);
            console.log('Weapons not found:', notFoundWeapons);
            showNotification(`${message}, ${totalNotFound} not found in database`, 'warning', 5000);
        } else {
            showNotification(`${message} successfully`, 'success');
        }
    }

    /////

    document.getElementById('searchWeapons')?.addEventListener('input', () => {
        renderAvailableWeapons();
    });

    // Setup weapon sort controls
    document.getElementById('weaponSortBy')?.addEventListener('change', (e) => {
        weaponSortBy = e.target.value;
        renderAvailableWeapons();
    });

    document.getElementById('weaponSortOrder')?.addEventListener('change', (e) => {
        weaponSortOrder = e.target.value;
        renderAvailableWeapons();
    });


    document.getElementById('confirmWeaponBtn')?.addEventListener('click', confirmWeaponEquip);
    document.getElementById('declineWeaponBtn')?.addEventListener('click', declineWeaponEquip);

    // Close modal when clicking outside
    document.getElementById('weaponConfirmationModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'weaponConfirmationModal') {
            declineWeaponEquip();
        }
    });


    document.getElementById('swapOathBtn')?.addEventListener('click', () => {
        if (!window.pendingOathSwap) return;

        const { current, new: newOath } = window.pendingOathSwap;

        // Get all talents that depend on the current oath
        const dependentTalents = getTalentsDependingOnOath(current);

        // Remove current oath and all dependent talents
        selectedTalents.delete(current.id);
        dependentTalents.forEach(t => selectedTalents.delete(t.id));

        // Close modal
        document.getElementById('oathSwapModal').classList.remove('active');
        window.pendingOathSwap = null;

        // Now proceed with adding the new oath
        selectTalent(newOath.id);
    });

    document.getElementById('cancelOathSwapBtn')?.addEventListener('click', () => {
        window.pendingOathSwap = null;
        document.getElementById('oathSwapModal').classList.remove('active');
    });

    // Close modal when clicking outside
    document.getElementById('oathSwapModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'oathSwapModal') {
            window.pendingOathSwap = null;
            document.getElementById('oathSwapModal').classList.remove('active');
        }
    });

    // Close button handler
    document.querySelector('#oathSwapModal .close-btn')?.addEventListener('click', () => {
        window.pendingOathSwap = null;
        document.getElementById('oathSwapModal').classList.remove('active');
    });


    window.addEventListener('error', (e) => {
        console.error('Global error caught:', e.error);
        showNotification('An unexpected error occurred. Check console for details.', 'error');
    });

    // Initialize weapons tab
    setupWeaponFilterButtons();


    // Initialize talents tab
    setupFilterButtons('availableFilters', availableFilters);
    setupFilterButtons('selectedFilters', selectedFilters);
    loadTalents();
    loadWeapons();
});