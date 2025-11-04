document.addEventListener('DOMContentLoaded', () => {
    // Global Constant for the point limit
    const MAX_TOTAL_POINTS = 330;

    // Selectors
    const addButtons = document.querySelectorAll('.add-input-btn');
    const calculateButton = document.getElementById('calculateButton');

    // ... (Condition Change Handler and Dynamic Input Management remain the same) ...

    const handleConditionChange = (event) => {
        const select = event.target;
        const inputElement = select.previousElementSibling;
        if (inputElement && inputElement.tagName === 'INPUT') {
            inputElement.setAttribute('data-condition', select.value);
        }
    };

    document.querySelectorAll('.condition-select').forEach(select => {
        select.addEventListener('change', handleConditionChange);
    });

    addButtons.forEach(button => {
        button.addEventListener('click', () => {
            const statRow = button.closest('.stat-row');
            const inputGroup = statRow.querySelector('.input-group');
            const currentInputs = inputGroup.querySelectorAll('input[type="number"]').length;

            if (currentInputs < 2) {
                const newInput = document.createElement('input');
                newInput.type = 'number';
                newInput.value = '0';
                newInput.classList.add('dynamic-input');
                newInput.setAttribute('data-condition', 'any');

                const newSelect = document.createElement('select');
                newSelect.classList.add('condition-select');
                newSelect.innerHTML = `
                    <option value="any">Any</option>
                    <option value="pre">Pre-Shrine</option>
                    <option value="post">Post-Shrine</option>
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
                    button.style.display = '';
                });
            }

            const totalInputs = inputGroup.querySelectorAll('input[type="number"]').length;
            if (totalInputs >= 2) {
                button.style.display = 'none';
            }
        });
    });

    // --- Calculation Logic ---

    function collectDesiredStats() {
        const desiredStats = {};

        document.querySelectorAll('.stat-row[data-stat]').forEach(statRow => {
            const statName = statRow.getAttribute('data-stat');
            desiredStats[statName] = [];

            statRow.querySelectorAll('.input-group input[type="number"]').forEach(input => {
                const value = parseInt(input.value) || 0;
                const condition = input.getAttribute('data-condition') || 'any';

                if (value > 0) {
                    desiredStats[statName].push({ value: value, condition: condition });
                }
            });
        });
        return desiredStats;
    }

    /**
     * Calculates the optimal distribution for pre-shrine, shrine averaging, and post-shrine.
     */
    function calculateOptimalOrder(desiredStats) {
    const MAX_TOTAL_POINTS = 330;
    const MAX_STAT_VALUE = 100;
    const BOTTLENECK_LIMIT = 25;
    
    // Identify attunement stats
    const attunementStats = ['flamecharm', 'frostdraw', 'thundercall', 'galebreathe', 'shadowcast', 'ironsing', 'bloodrend'];
    
    // Parse requirements for each stat
    const statRequirements = {};
    for (const [statName, requirements] of Object.entries(desiredStats)) {
        if (requirements.length === 0) continue;
        
        statRequirements[statName] = {
            isAttunement: attunementStats.includes(statName.toLowerCase()),
            requirements: requirements,
            minPre: 0,
            minPost: 0,
            hasAny: false
        };
        
        // Determine minimum pre/post requirements
        for (const req of requirements) {
            if (req.condition === 'pre') {
                statRequirements[statName].minPre = Math.max(statRequirements[statName].minPre, req.value);
            } else if (req.condition === 'post') {
                statRequirements[statName].minPost = Math.max(statRequirements[statName].minPost, req.value);
            } else if (req.condition === 'any') {
                statRequirements[statName].hasAny = true;
            }
        }
    }
    
    // Generate all possible combinations for 'any' conditions
    function generateCombinations(statReqs) {
        const statsWithAny = [];
        const baseConfig = {};
        
        for (const [statName, data] of Object.entries(statReqs)) {
            baseConfig[statName] = {
                isAttunement: data.isAttunement,
                minPre: data.minPre,
                minPost: data.minPost,
                anyRequirements: []
            };
            
            if (data.hasAny) {
                const anyReqs = data.requirements.filter(r => r.condition === 'any');
                baseConfig[statName].anyRequirements = anyReqs;
                statsWithAny.push(statName);
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
            
            combinations.push(config);
        }
        
        return combinations.length > 0 ? combinations : [baseConfig];
    }
    
    const allCombinations = generateCombinations(statRequirements);
    console.log(`Testing ${allCombinations.length} combinations...`);
    
    let bestSolution = null;
    let bestScore = -Infinity;
    
    for (const config of allCombinations) {
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
            
            // If we need post-shrine points but no pre-shrine, invest 1 point to include it
            if (data.minPost > 0 && data.minPre === 0) {
                preShrine[statName] = {
                    currentPre: 1,
                    isAttunement: data.isAttunement
                };
                statsToInclude.add(statName);
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
            const neededPost = Math.max(0, data.minPost - postShrineValue);
            
            finalStats[statName] = postShrineValue + neededPost;
            totalPostInvestment += neededPost;
            
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
        console.log(finalStats)
        // Calculate score (prefer more leftover points)
        const leftoverPoints = MAX_TOTAL_POINTS - totalPoints;// + shrineResult.leftoverPoints;
        const score = leftoverPoints;

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
        console.log(bestSolution.shrineLeftover)
        
        console.log('\nFinal Stats:');
        console.table(bestSolution.finalStats);
        
        console.log(`\nTotal Points Used: ${bestSolution.totalPreInvestment + bestSolution.totalPostInvestment}`);
        console.log(`Leftover Points: ${bestSolution.leftoverPoints}`);
        console.log(`Shrine Leftover: ${bestSolution.shrineLeftover}`);
    } else {
        console.log('No valid solution found within constraints.');
    }
    
    return bestSolution;
}

function simulateShrineAveraging(stats) {
    const BOTTLENECK_LIMIT = 25;
    const MAX_STAT = 100;
    const attunements = ['flamecharm', 'frostdraw', 'thundercall', 'galebreathe', 'shadowcast', 'ironsing', 'bloodrend'];

    // Calculate total invested and affected stats
    let totalInvested = 0;
    const affectedStats = [];

    for (const [statName, statData] of Object.entries(stats)) {
        if (statData.currentPre > 0) {
            totalInvested += statData.currentPre;
            affectedStats.push(statName);
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
    let bottleneckedDivideBy = affectedStats.filter(s => !attunements.includes(s)).length;
    const bottlenecked = [];
    let bottleneckedStats = false;
    let previousStats = { ...postShrine };

    do {
        let bottleneckedPoints = 0;
        bottleneckedStats = false;

        // Check for bottlenecking in non-attunement stats only
        for (const statName of affectedStats) {
            const isAttunement = attunements.includes(statName.toLowerCase());
            console.log(isAttunement, statName.toLowerCase())

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

        // Redistribute bottlenecked points ONLY to non-bottlenecked NON-ATTUNEMENT stats
        if (bottleneckedDivideBy > 0 && bottleneckedPoints !== 0) {
            for (const statName of affectedStats) {
                const isAttunement = attunements.includes(statName);
                
                if (!isAttunement && !bottlenecked.includes(statName)) {
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

        // The collectDesiredStats function already filters out 0-value requirements.

        console.log('--- User Desired Requirements ---');
        console.table(desiredStats);

        const solution = calculateOptimalOrder(desiredStats);
        
        if (solution) {
            displayResults(solution);
        } else {
            alert('No valid solution found within constraints. Please adjust your requirements.');
        }
    }

    function calculatePower(points) {
        const power = Math.floor((points - 15) / 15);
        return Math.max(0, Math.min(20, power));
    }

    function displayResults(solution) {
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
        
        // Populate post-shrine values
        const postShrineValues = document.getElementById('postShrineValues');
        postShrineValues.innerHTML = '';
        for (const [stat, value] of Object.entries(solution.postShrine)) {
            const statItem = document.createElement('div');
            statItem.className = 'stat-item';
            statItem.innerHTML = `
                <span class="stat-name">${stat}</span>
                <span class="stat-value">${value}</span>
            `;
            postShrineValues.appendChild(statItem);
        }
        
        // Populate final stats
        const finalStats = document.getElementById('finalStats');
        finalStats.innerHTML = '';
        for (const [stat, value] of Object.entries(solution.finalStats)) {
            const statItem = document.createElement('div');
            statItem.className = 'stat-item';
            statItem.innerHTML = `
                <span class="stat-name">${stat}</span>
                <span class="stat-value">${value}</span>
            `;
            finalStats.appendChild(statItem);
        }
        
        // Show modal
        modal.classList.add('active');
    }
    
    // Close modal functionality
    const modal = document.getElementById('resultsModal');
    const closeBtn = document.querySelector('.close-btn');
    
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
});