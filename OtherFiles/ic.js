var ic = {
  // -----------------------------------------------------------------------------
  // ic - Module
  //
  // Module that offers high level functions and wizard for InnoDB cluster
  //
  // The ic module can be used by end users to simplify dealing with InnoDB
  // clusters.
  //
  name: "ic",
  version: "1.0.13",
  cluster: "undefined",
  description: "InnoDB cluster module exposing high level functions",
  help: function () {
    println(
      "\nThe global 'ic' module offers a set of utilities functions for\n" +
      "InnoDB cluster usage. The following functions are available.\n\n" +
      "Sandbox Cluster Functions\n" +
      "-------------------------\n" +
      " - deploySandboxCluster            Deploys and starts a ready-to-use\n" +
      "                                   sandbox cluster.\n" +
      " - deleteSandboxInstances          Deletes all sandbox instances and \n" +
      "                                   the sandbox cluster.\n" +
      " - stopSandboxInstances            Stops all sandbox instances and \n" +
      "                                   the sandbox cluster.\n" +
      " - startSandboxCluster             Starts a sandbox cluster after it \n" +
      "                                   has been shut down.\n" +
      " - restartSandboxCluster           Stops and restarts the sandbox cluster.\n" +
      "\nProduction Cluster Functions\n" +
      "----------------------------\n" +
      " - prepareLocalInstance            Prepares an instance for InnoDB cluster usage.\n" +
      "                                   NOTE: The MySQL Shell needs to be run with sudo.\n" +
      " - createProductionCluster         Creates a new, ready-to-use production\n" +
      "                                   cluster on a local MySQL instance.\n" +
      " - addLocalInstanceToCluster       Adds a Local MySQL Server instance to\n" +
      "                                   an existing InnoDB Cluster.\n" +
      "\nGeneral Functions\n" +
      "-----------------\n" +
      " - status                          Prints the status of the cluster.\n");
  },
  //
  // The deploySandboxCluster() function deploys an ready-to-use sandbox cluster
  //
  // The function goes through all steps to create an ready-to-use InnoDB cluster
  // using sandbox instances.
  //
  // After successful creating of the cluster, the global 'cluster' variable is set
  //
  // Example: ic.deploySandboxCluster(5, 'root');
  //
  // @param instanceCount     number of sandbox instances in the cluster
  //                          from 1-9.
  // @param rootPassword      the password that will be set for the root
  //                          user.
  //
  deploySandboxCluster: function (instanceCount, rootPassword) {
    // Display information text and list ports that will be used
    println("\nMySQL InnoDB Cluster Sandbox Setup");
    println("==================================");
    println("Setting up a MySQL InnoDB cluster with " + instanceCount +
      " MySQL Server sandbox instances.");
    println("The instances will be installed in: ");
    println("  Unix-like systems: ~/mysql-sandboxes.");
    println("  Windows: %userprofile%\\MySQL\\mysql-sandboxes");

    // If the user has not provided the instanceCount, ask for it
    if (instanceCount === undefined || instanceCount === null) {
      instanceCount = parseInt(shell.prompt(
        "\nPlease enter the number of instances for this sandbox cluster.\n" +
        "Choose a number between 1 and 9, with 3 being the default: ", { defaultValue: "3" }));
    }

    // Check if a instanceCount was given and if it is within range
    if (instanceCount === undefined || instanceCount === null) {
      throw ("ERROR: The instanceCount cannot be null.\n");
    } else if (instanceCount !== parseInt(instanceCount, 10)) {
      throw ("ERROR: The instanceCount given is not an integer.\n");
    }
    if (instanceCount < 1 || instanceCount > 9) {
      throw ("ERROR: The instanceCount needs to be between 1 and 9.\n");
    }

    // If the user has not provided the password, ask for it
    if (rootPassword === undefined || rootPassword === null) {
      rootPassword = shell.prompt(
        "\nPlease enter the password that will be set for the root account.\n" +
        "The password has to consist of 4 characters or more: ",
        { type: 'password' });
    }

    // Check if the rootpassword is given and valid
    if (rootPassword === undefined || rootPassword === null ||
      rootPassword === "") {
      throw ("ERROR: The rootPassword cannot be null or empty.\n");
    } else if (!(typeof rootPassword === 'string' || rootPassword instanceof String)) {
      throw ("ERROR: The rootPassword given is not a String.\n");
    } else if (rootPassword.length < 4) {
      throw ("ERROR: The rootPassword minimum length has to be 4.\n");
    }

    // List number of instance ports
    print("\nThe instances will be running on port" + (instanceCount > 1 ? "s" : "") + " ");
    var i;
    for (i = 0; i < instanceCount; i++) {
      print(3310 + (i * 10));
      if (i < instanceCount - 1) {
        print(", ");
      }
    }
    println(".\n");

    // Perform the creation of the InnoDB cluster
    try {
      // Deploy the requested number of sandbox instances
      println("Deploy the requested number of sandbox instances...");
      for (i = 0; i < instanceCount; i++) {
        dba.deploySandboxInstance(3310 + (i * 10), { password: rootPassword });
      }
      println("\nINFO: Sandbox instances deployed successfully.\n");

      // Connect to the seed instance
      println("Setting up InnoDB cluster...");
      shell.connect("root@localhost:3310", rootPassword);

      // Create the InnoDB cluster with the name "sandboxCluster"
      var sandboxCluster = dba.createCluster("sandboxCluster");

      // Wait till seed instances gets to online status, maximum of 10 secs
      print("Waiting till seed instance reaches ONLINE status.");
      var stat = sandboxCluster.status();
      for (i = 0; stat.defaultReplicaSet.topology[
        stat.defaultReplicaSet.primary].status !== "ONLINE" && i < 10; i++) {
        os.sleep(1);
        print(".");
        stat = sandboxCluster.status();
      }
      if (stat.defaultReplicaSet.topology[
        stat.defaultReplicaSet.primary].status === "ONLINE") {
        println("\nSeed instance reached ONLINE status.\n");
      } else {
        println("\nSeed instance has not reached ONLINE status yet.\n");
      }

      // Add other instances to the cluster
      println("Adding instances to the cluster...");

      for (i = 1; i < instanceCount; i++) {
        sandboxCluster.addInstance({
          user: "root", host: "localhost",
          port: 3310 + (i * 10), password: rootPassword
        });
      }
      println("\nInstances successfully added to the cluster.");

      // Wait till add instances get to online status, maximum of 10 secs
      print("Waiting till all instances reach ONLINE status.");
      stat = sandboxCluster.status();
      i = 0;
      var allOnline = false;
      while (!allOnline && i < 10) {
        os.sleep(1);
        i++;
        print(".");
        stat = sandboxCluster.status();

        var topology = stat.defaultReplicaSet.topology;
        allOnline = true;
        for (var instanceKey in topology) {
          var instance = topology[instanceKey];

          if (instance.status !== "ONLINE") {
            allOnline = false;
            break;
          }
        }
      }
      if (allOnline) {
        println("\nAll instances reached ONLINE status.\n");

        //Re-configure the instances to persist the new GR configurations
        println("Reconfiguring instances of the cluster...");

        for (i = 0; i < instanceCount; i++) {
          dba.configureLocalInstance({
            user: "root", host: "localhost",
            port: 3310 + (i * 10), password: rootPassword
          });
        }
        println("\nInstances successfully re-configured.\n");
      } else {
        println("\nSome instances have not reached ONLINE status yet. " +
          "Please allow more time for them to catch up to the seed " +
          "instance.\n");
      }

      // Set the global cluster variable
      cluster = sandboxCluster;

      // Set the ic module cluster reference, which is base for other ic functions
      this.cluster = sandboxCluster;

      println("\nSUCCESS: InnoDB cluster deployed successfully. " +
        "Call ic.status() to get status information about the cluster.");
    } catch (e) {
      throw ("Failed to create the InnoDB cluster. Message: " +
        e.message);
    }
  },
  //
  // The deleteSandboxInstances() function removes all sandbox instances on
  // the ports 3310 - 3390
  //
  // Example: ic.deleteSandboxInstances();
  //
  // @param rootPassword      the password that will be set for the root
  //                          user.
  //
  deleteSandboxInstances: function (rootPassword) {
    println("\nMySQL InnoDB Sandbox Instance Deletion");
    println("======================================");
    println("Stopping and removing all possible sandbox instances to " +
      "leave a clean system behind...\n");

    // If the user has not provided the password, ask for it
    if (rootPassword === undefined || rootPassword === null) {
      rootPassword = shell.prompt(
        "Please enter the root password for the sandbox cluster: ", { type: 'password' });
    }

    // Check if the rootpassword is given and valid
    if (rootPassword === undefined || rootPassword === null ||
      rootPassword === "") {
      throw ("ERROR: The rootPassword cannot be null or empty.\n");
    } else if (!(typeof rootPassword === 'string' || rootPassword instanceof String)) {
      throw ("ERROR: The rootPassword given is not a String.\n");
    } else if (rootPassword.length < 4) {
      throw ("ERROR: The rootPassword minimum length has to be 4.\n");
    }

    // If ic.cluster and/or the global cluster point to a sandbox cluster,
    // clear these variables
    var clearCluster = false;
    var clearGlobalCluster = false;
    if (this.cluster !== "undefined") {
      if (this.cluster = cluster)
        cluster = null;
      this.cluster = null;
    }

    // Loop over all possible sandbox instances and remove them
    for (i = 0; i < 9; i++) {
      var instancePort = (3310 + (i * 10));

      println("Removing sandbox instance " + instancePort + "...");

      // Try to stop the instance before removing it
      try {
        dba.stopSandboxInstance(instancePort, { password: rootPassword })
      } catch (e) {
        println("INFO: Error stopping sandbox instance. Already stopped or not existing.\n")
      }

      // Try to remove the sandbox instance
      try {
        dba.deleteSandboxInstance(instancePort);
      } catch (e) {
        println("INFO: Could not remove the instance. Message: " + e.message);
      }
    }

    println("\nSUCCESS: Sandbox instances have been deleted.");
  },
  //
  // The stopSandboxInstances() function shuts down all sandbox instances
  //
  // Example: ic.stopSandboxInstances("foobar");
  //
  // @rootPassword          root password used for the sandbox instances
  //
  stopSandboxInstances: function (rootPassword) {
    println("\nMySQL Sandbox Instances Shutdown");
    println("================================");
    println("Shutting down all sandbox instances...\n");

    // If the user has not provided the password, ask for it
    if (rootPassword === undefined || rootPassword === null) {
      rootPassword = shell.prompt(
        "Please enter the root password for the sandbox cluster: ", { type: 'password' });
    }

    // Loop over all possible sandbox instances and shut them down
    for (var i = 8; i >= 0; i--) {
      var instancePort = (3310 + (i * 10));

      println("Shutting down sandbox instance " + instancePort + "...");

      try {
        dba.stopSandboxInstance(instancePort, { password: rootPassword })
      } catch (e) {
        println("INFO: Error stopping sandbox instance. Already stopped " +
          "or not existing. Message: " + e.message);
      }
    }

    // Sleep 1 second to ensure removal is completed
    sleep(1);
  },
  //
  // The startSandboxCluster() function starts the local sandbox cluster
  //
  // Example: ic.startSandboxCluster("foobar");
  //
  // @rootPassword          root password used for the sandbox instances
  //
  startSandboxCluster: function (rootPassword) {
    println("\nMySQL Sandbox Cluster Start");
    println("===========================");
    println("Starting the sandbox cluster...\n");

    // If the user has not provided the password, ask for it
    if (rootPassword === undefined || rootPassword === null) {
      rootPassword = shell.prompt(
        "Please enter the root password for the sandbox cluster: ", { type: 'password' });
    }

    // Restart first instance
    try {
      dba.startSandboxInstance(3310);

      // Connect to the restarted instance and reboot the cluster
      shell.connect("root@localhost:3310", rootPassword);

      // Set the ic.cluster variable
      this.cluster = dba.rebootClusterFromCompleteOutage("sandboxCluster",
        { password: rootPassword, rejoinInstances: [], removeInstances: [] });

      // Set global cluster variable
      cluster = this.cluster;
    } catch (e) {
      throw ("ERROR: Cannot reboot the cluster. Message: " + e.message);
    }

    try {
      var instancesPorts = this.getSandboxClusterInstancePorts(rootPassword);

      // Remove the seed instance from the list of instances
      for (var i = instancesPorts.length - 1; i >= 0; i--) {
        if (instancesPorts[i] === 3310) {
          instancesPorts.splice(i, 1);
        }
      }

      // Try to restart the instances
      for (var instancePort of instancesPorts) {
        try {
          dba.startSandboxInstance(instancePort);
        } catch (e) {
          println("INFO: Cannot start sandbox instance. The instance might " +
            "already be running or non existing.\n")
        }
      }
    } catch (e) {
      throw ("ERROR: Failed to get the sandbox cluster instances. " +
        "Message: " + e.message);
    }

    println("\nSUCCESS: InnoDB cluster successfully restarted. " +
      "Call ic.status() to get status information about the cluster.");
  },
  //
  // The restartSandboxCluster() function restarts the local sandbox cluster
  //
  // Example: ic.restartSandboxCluster("foobar");
  //
  // @rootPassword          root password used for the sandbox instances
  //
  restartSandboxCluster: function (rootPassword) {
    // First, stop all sandbox instances
    this.stopSandboxInstances(rootPassword);
    // Then start the cluster again
    this.startSandboxCluster(rootPassword);
  },
  //
  // The prepareLocalInstance() function updates the configuration of an instances
  // to make it ready for InnoDB cluster usage
  //
  // Example: ic.prepareLocalInstance("admin", "foobar", 3306, "bazinga",
  //                                "/etc/mysql/mysql.conf.d/mysqld.cnf");
  //
  // @param clusterAdmin          Cluster Admin username
  // @param clusterAdminPassword  Cluster Admin username password
  // @param localInstancePort     The port the local instance is running on
  // @param rootPassword          The root user password
  // @param cnfPath               The configuration file path
  //
  prepareLocalInstance: function (clusterAdmin, clusterAdminPassword,
    localInstancePort, rootPassword,
    cnfPath) {
    // Display information text
    println("\nMySQL InnoDB Cluster Instance Preparation");
    println("=========================================");
    println("Preparing an instance for InnoDB cluster usage ...\n");

    if (clusterAdmin === undefined || clusterAdmin === null) {
      clusterAdmin = shell.prompt(
        "\nPlease enter a name for the InnoDB cluster administrator (Default: dba): ",
        { defaultValue: "dba" });
    }
    if (!(typeof clusterAdmin === 'string' || clusterAdmin instanceof String)) {
      throw ("ERROR: The clusterAdmin given is not a String.\n");
    } else if (clusterAdmin.lenght === 0) {
      throw ("ERROR: The clusterAdmin cannot be empty.\n");
    }

    if (clusterAdminPassword === undefined || clusterAdminPassword === null) {
      clusterAdminPassword = shell.prompt(
        "Please enter a password for the InnoDB cluster administrator " +
        "(At least 4 characters): ", { type: 'password' });

      // Let the user verify the password
      var clusterAdminPassword2 = "";
      while (clusterAdminPassword !== clusterAdminPassword2) {
        clusterAdminPassword2 = shell.prompt(
          "Please repeat the password for the InnoDB cluster Administrator: ",
          { type: 'password' });

        if (clusterAdminPassword !== clusterAdminPassword2)
          println('The passwords do not match. Please try again.');
      }
    }
    if (!(typeof clusterAdminPassword === 'string' || clusterAdminPassword instanceof String)) {
      throw ("ERROR: The clusterAdminPassword given is not a String.\n");
    } else if (clusterAdminPassword.lenght < 4) {
      throw ("ERROR: The clusterAdminPassword minimum length has to be 4.\n");
    }

    if (localInstancePort === undefined || localInstancePort === null) {
      localInstancePort = parseInt(shell.prompt(
        "\nPlease enter the TCP port the MySQL instance is running on (Defaut: 3306): ",
        { defaultValue: "3306" }));
    }
    if (localInstancePort !== parseInt(localInstancePort, 10)) {
      throw ("ERROR: The seedInstancePort given is not an Integer.\n");
    } else if (localInstancePort < 1024 || localInstancePort > 65535) {
      throw ("ERROR: Invalid seedInstancePort value. Please use a valid " +
        "TCP port number >= 1024 and <= 65535.");
    }

    if (rootPassword === undefined || rootPassword === null) {
      rootPassword = shell.prompt(
        "\nPlease enter the root password of the MySQL instance: ",
        { type: 'password' });
    }
    if (!(typeof rootPassword === 'string' || rootPassword instanceof String)) {
      throw ("ERROR: The rootPassword given is not a String.\n");
    } else if (rootPassword.lenght < 4) {
      throw ("ERROR: The minimum length of rootPassword is 4 characters.\n");
    }

    if (cnfPath === undefined || cnfPath === null) {
      cnfPath = shell.prompt(
        "\nPlease enter the full path to the my.cnf/my.ini file or " +
        "press enter to use the default location: ");
    }
    if (!(typeof cnfPath === 'string' || cnfPath instanceof String)) {
      throw ("ERROR: The cnfPath given is not a String.\n");
    }

    // Configure the seed instance
    try {
      var instanceUri = "root@localhost:" + localInstancePort;

      if (cnfPath !== "") {
        dba.configureLocalInstance(instanceUri,
          {
            password: rootPassword, mycnfPath: cnfPath,
            clusterAdmin: clusterAdmin,
            clusterAdminPassword: clusterAdminPassword
          });
      } else {
        dba.configureLocalInstance(instanceUri,
          {
            password: rootPassword,
            clusterAdmin: clusterAdmin,
            clusterAdminPassword: clusterAdminPassword
          });
      }
    } catch (e) {
      throw ("ERROR: The local instance could not be configured. Message: " +
        e.message);
    }

    println("SUCCESS: The instance configuration has been prepared for InnoDB cluster usage.\n" +
      "NOTE: The instance now needs to be restarted to adopt the updated configuration.\n");
  },
  //
  // The createProductionCluster() function deploys an ready-to-use production cluster
  //
  // The function goes through all steps to create an ready-to-use InnoDB cluster
  // using a 'real' seed instance.
  //
  // After successful creating of the cluster, the global 'cluster' variable is set
  //
  // Example: ic.createProductionCluster("devCluster", "admin", "foobar", "192.168.1.123", 3306);
  //
  // @param clusterName           InnoDB Cluster name
  // @param clusterAdmin          Cluster Admin username
  // @param clusterAdminPassword  Cluster Admin username password
  // @param seedInstanceHostname  The seed instance host address IP (not 127.0.0.1 or localhost)
  // @param seedInstancePort      The seed instance host port
  //
  createProductionCluster: function (clusterName, clusterAdmin, clusterAdminPassword,
    seedInstanceHostname, seedInstancePort) {
    // Display information text
    println("\nMySQL InnoDB Cluster Setup");
    println("==========================");
    println("Setting up a MySQL InnoDB cluster on this machine ...\n");

    if (clusterName === undefined || clusterName === null) {
      clusterName = shell.prompt(
        "\nPlease enter a name for the InnoDB cluster (Default: devCluster): ",
        { defaultValue: "devCluster" });
    }
    if (!(typeof clusterName === 'string' || clusterName instanceof String)) {
      throw ("ERROR: The clusterName given is not a String.\n");
    } else if (clusterName.lenght === 0) {
      throw ("ERROR: The clusterName cannot be empty.\n");
    }

    if (clusterAdmin === undefined || clusterAdmin === null) {
      clusterAdmin = shell.prompt(
        "\nPlease enter a name for the InnoDB cluster administrator (Default: dba): ",
        { defaultValue: "dba" });
    }
    if (!(typeof clusterAdmin === 'string' || clusterAdmin instanceof String)) {
      throw ("ERROR: The clusterAdmin given is not a String.\n");
    } else if (clusterAdmin.lenght === 0) {
      throw ("ERROR: The clusterAdmin cannot be empty.\n");
    }

    if (clusterAdminPassword === undefined || clusterAdminPassword === null ||
      clusterAdminPassword === "") {
      clusterAdminPassword = shell.prompt(
        "Please enter a password for the InnoDB cluster administrator: ", { type: 'password' });
    }
    if (!(typeof clusterAdminPassword === 'string' || clusterAdminPassword instanceof String)) {
      throw ("ERROR: The clusterAdminPassword given is not a String.\n");
    } else if (clusterAdminPassword.lenght < 4) {
      throw ("ERROR: The clusterAdminPassword minimum length has to be 4.\n");
    }

    if (seedInstanceHostname === undefined || seedInstanceHostname === null) {
      seedInstanceHostname = shell.prompt(
        "\nPlease enter the domain name or IP address of this machine.\n" +
        "Note that the address has to be an external address (not 127.0.0.1 or localhost): ");
    }
    if (!(typeof seedInstanceHostname === 'string' || seedInstanceHostname instanceof String)) {
      throw ("ERROR: The seedInstanceHost given is not a String.\n");
    } else if (seedInstanceHostname.lenght === 0) {
      throw ("ERROR: The seedInstanceHost cannot be empty.\n");
    }
    if (!this.validateIpAddress(seedInstanceHostname) &&
      !this.validateDomainName(seedInstanceHostname)) {
      throw ("ERROR: The seedInstanceHost given is not a valid IP address nor domain name.\n");
    }

    if (seedInstancePort === undefined || seedInstancePort === null) {
      seedInstancePort = parseInt(shell.prompt(
        "\nPlease enter the TCP port the MySQL instance is running on (Defaut: 3306): ",
        { defaultValue: "3306" }));
    }
    if (seedInstancePort !== parseInt(seedInstancePort, 10)) {
      throw ("ERROR: The seedInstancePort given is not an Integer.\n");
    } else if (seedInstancePort < 1024 || seedInstancePort > 65535) {
      throw ("ERROR: Invalid seedInstancePort value. Please use a valid " +
        "TCP port number >= 1024 and <= 65535.");
    }

    // Open a session to the seed instance using the external IP
    try {
      var instanceUri = clusterAdmin + "@" +
        seedInstanceHostname + ":" + seedInstancePort;

      shell.connect(instanceUri, clusterAdminPassword);
    } catch (e) {
      throw ("ERROR: Failed to establish a session. Message: " +
        e.message);
    }

    // Create the InnoDB cluster
    try {
      var theCluster = dba.createCluster(clusterName);
    } catch (e) {
      throw ("ERROR: The InnoDB cluster could not be created. Message: " +
        e.message);
    }

    // Set the global cluster variable
    cluster = theCluster;

    // Set the ic module cluster reference, which is base for other ic functions
    this.cluster = theCluster;

    println("SUCCESS: InnoDB cluster deployed successfully. Call ic.status() " +
      "to get status information about the cluster");
  },
  //
  // The addLocalInstanceToCluster() function adds a Local MySQL Server instance to
  // an exiting InnoDB Cluster
  //
  // The function goes through all steps to get a local instance ready for InnoDB
  // cluster usage, and adds it to an existing cluster
  //
  // After successfully adding the instance to the cluster, 'cluster' variable is returned
  //
  // Example: ic.addLocalInstanceToCluster("dba", "bazinga", "localhost", 3306,
  //                                       "foobar", "localhost", 3307);
  //
  // @param clusterAdmin              Cluster Admin username
  // @param clusterAdminPassword      InnoDB Cluster clusterAdmin password
  // @param clusterInstanceHostname   The hostname of the InnoDB Cluster instances
  // @param clusterInstancePort       The port of the InnoDB Cluster instance
  // @param localRootPassword         The root user password of the local instance
  // @param localInstanceHostname     The hostname of the local instance (not 127.0.0.1 or localhost)
  // @param localInstancePort         The port of the local instance
  //
  addLocalInstanceToCluster: function (clusterAdmin, clusterAdminPassword,
    clusterInstanceHostname, clusterInstancePort,
    localRootPassword, localInstanceHostname, localInstancePort) {
    if (clusterAdmin === undefined || clusterAdmin === null) {
      clusterAdmin = shell.prompt(
        "\nPlease enter a name for the InnoDB cluster administrator (Default: dba): ",
        { defaultValue: "dba" });
    }
    if (!(typeof clusterAdmin === 'string' || clusterAdmin instanceof String)) {
      throw ("ERROR: The clusterAdmin given is not a String.\n");
    } else if (clusterAdmin.lenght === 0) {
      throw ("ERROR: The clusterAdmin cannot be empty.\n");
    }

    if (clusterAdminPassword === undefined || clusterAdminPassword === null ||
      clusterAdminPassword === "") {
      clusterAdminPassword = shell.prompt(
        "Please enter a password for the InnoDB cluster administrator: ", { type: 'password' });
    }
    if (!(typeof clusterAdminPassword === 'string' || clusterAdminPassword instanceof String)) {
      throw ("ERROR: The clusterAdminPassword given is not a String.\n");
    } else if (clusterAdminPassword.lenght < 4) {
      throw ("ERROR: The clusterAdminPassword minimum length has to be 4.\n");
    }

    if (clusterInstanceHostname === undefined || clusterInstanceHostname === null) {
      clusterInstanceHostname = shell.prompt(
        "\nPlease enter the hostname of one of the cluster instances: ");
    }
    if (!(typeof clusterInstanceHostname === 'string' || clusterInstanceHostname instanceof String)) {
      throw ("ERROR: The clusterInstanceHostname given is not a String.\n");
    } else if (clusterInstanceHostname.lenght === 0) {
      throw ("ERROR: The clusterInstanceHostname cannot be empty.\n");
    }
    if (!this.validateIpAddress(clusterInstanceHostname) && !this.validateDomainName(clusterInstanceHostname)) {
      throw ("ERROR: The clusterInstanceHostname given is not a valid IP address nor domain name.\n");
    }

    if (clusterInstancePort === undefined || clusterInstancePort === null) {
      clusterInstancePort = parseInt(shell.prompt(
        "\nPlease enter the TCP port the cluster instance is running on (Defaut: 3306): ",
        { defaultValue: "3306" }));
    }
    if (clusterInstancePort !== parseInt(clusterInstancePort, 10)) {
      throw ("ERROR: The clusterInstancePort given is not an Integer.\n");
    } else if (clusterInstancePort < 1024 || clusterInstancePort > 65535) {
      throw ("ERROR: Invalid clusterInstancePort value. Please use a valid " +
        "TCP port number >= 1024 and <= 65535.");
    }

    if (localRootPassword === undefined || localRootPassword === null ||
      localRootPassword === "") {
      localRootPassword = shell.prompt(
        "Please enter a password for the root account of the local MySQL instance: ",
        { type: 'password' });
    }
    if (!(typeof localRootPassword === 'string' || localRootPassword instanceof String)) {
      throw ("ERROR: The localRootPassword given is not a String.\n");
    } else if (localRootPassword.lenght < 4) {
      throw ("ERROR: The minimum length of localRootPassword is 4 characters.\n");
    }

    if (localInstanceHostname === undefined || localInstanceHostname === null) {
      localInstanceHostname = shell.prompt(
        "\nPlease enter the domain name or IP address of this machine.\n" +
        "Note that the address has to be an external address (not 127.0.0.1 or localhost): ");
    }
    if (!(typeof localInstanceHostname === 'string' || localInstanceHostname instanceof String)) {
      throw ("ERROR: The localInstanceHostname given is not a String.\n");
    } else if (localInstanceHostname.lenght === 0) {
      throw ("ERROR: The localInstanceHostname cannot be empty.\n");
    }
    if (!this.validateIpAddress(localInstanceHostname) && !this.validateDomainName(localInstanceHostname)) {
      throw ("ERROR: The localInstanceHostname given is not a valid IP address nor domain name.\n");
    }

    if (localInstancePort === undefined || localInstancePort === null) {
      localInstancePort = parseInt(shell.prompt(
        "\nPlease enter the TCP port the local MySQL instance is running on (Defaut: 3306): ",
        { defaultValue: "3306" }));
    }
    if (localInstancePort !== parseInt(localInstancePort, 10)) {
      throw ("ERROR: The localInstancePort given is not an Integer.\n");
    } else if (localInstancePort < 1024 || localInstancePort > 65535) {
      throw ("ERROR: Invalid localInstancePort value. Please use a valid " +
        "TCP port number >= 1024 and <= 65535.");
    }

    // Display information text
    println("\nAdd Local Instance to MySQL InnoDB Cluster");
    println("=========================================");
    println("Adding the instance '" + localInstanceHostname + ":" + localInstancePort + "' ");
    println("to the InnoDB cluster running on '" +
      clusterInstanceHostname + ':' + clusterInstancePort + "'");

    // Open a session to the Cluster Seed instance using the given URI
    try {
      var instanceUri = clusterAdmin + "@" +
        clusterInstanceHostname + ":" + clusterInstancePort;

      shell.connect(instanceUri, clusterAdminPassword);
    } catch (e) {
      throw ("ERROR: Failed to establish a session to the cluster instance '" +
        instanceUri + "'. Message: " + e.message);
    }

    // Get the InnoDB cluster
    var theCluster;
    try {
      theCluster = dba.getCluster();
    } catch (e) {
      throw ("ERROR: The InnoDB cluster could not be retrived. Message: " + e.message);
    }

    // Add the instance to the cluster
    try {
      var instanceUri = clusterAdmin + "@" +
        localInstanceHostname + ":" + localInstancePort;

      theCluster.addInstance(instanceUri, { password: clusterAdminPassword });
    } catch (e) {
      throw ("ERROR: The Instance '" + instanceUri +
        "' could not be added to the cluster. Message: " + e.message);
    }

    // Set the global cluster variable
    cluster = theCluster;

    // Set the ic module cluster reference, which is base for other ic functions
    this.cluster = theCluster;

    println("\nSUCCESS: Instance successfully added to the InnoDB cluster.");
  },
  //
  // The status() function prints the status of the cluster in a human
  // readable format
  //
  // @param rootPassword      The root user password
  //
  status: function (rootPassword) {
    // If the ic.cluster is not defined yet, check if global cluster
    // variable is set or try to get cluster from current session
    if (this.cluster === "undefined" || this.cluster === null) {
      // check if global cluster variable is set
      if (typeof cluster !== "undefined") {
        this.cluster = cluster;
      } else if (session.isOpen() === true) {
        // Get the InnoDB cluster from the current session
        try {
          this.cluster = dba.getCluster();
          cluster = this.cluster;
        } catch (e) {
          throw ("ERROR: The InnoDB cluster could not be retrived. Message: " + e.message);
        }
      } else {
        throw ("ERROR: No cluster defined yet. Please use shell.connect() " +
          "to connect to an instance that is part of a cluster or\n" +
          "use ic.deploySandboxCluster() or ic.createProductionCluster() to " +
          "create a new cluster.");
      }
    }

    var stat = this.cluster.status();

    println("\nMySQL InnoDB Cluster Status");
    println("===========================");
    println("Cluster Name:      " + stat.clusterName);
    println("Cluster Status:    " + stat.defaultReplicaSet.statusText);
    println("Status Code:       " + stat.defaultReplicaSet.status);
    println("-----------------------------------------");
    println("Primary Instance:  " + stat.defaultReplicaSet.primary);
    println("-----------------------------------------");

    var topology = stat.defaultReplicaSet.topology;
    var instanceCount = 0;
    for (var instanceKey in topology) {
      instanceCount++;
    }

    println("HA Topology:       " +
      instanceCount + " instance" + (instanceCount > 1 ? "s" : "") + "");

    for (var instanceKey in topology) {
      var instance = topology[instanceKey];

      println("- " + instance.address + " (" + instance.mode +
        ") - Status: " + instance.status);
    }

    println("");
  },
  //
  // The getSandboxClusterInstancePorts() function gets the list of ports that
  // are part of the sandbox cluster
  //
  // The first tries to connect to the sandbox instance on port 3310. If that
  // does not work it tries to start the instance first and then connect
  //
  // After the connection to the instance has been established, it iterates
  // over all instances of the cluster and returns the list if ports
  //
  // Example: ic.getSandboxClusterInstancePorts("bazinga");
  //
  // @param rootPassword      The root user password
  //
  // @returns                 A list of ports
  //
  getSandboxClusterInstancePorts: function (rootPassword) {
    // Make sure the ic.cluster variable is set
    if (this.cluster === "undefined" || this.cluster === null)
      throw ("Could not access the cluster.");

    // Get the cluster topology
    var topology = this.cluster.describe();
    var instances = topology.defaultReplicaSet.instances;

    var instancesPorts = [];

    // Loop over the instances
    for (var i in instances) {
      var host = instances[i].host;
      var port = host.substring(host.lastIndexOf(":") + 1);
      instancesPorts.push(parseInt(port, 10));
    }

    return instancesPorts;
  },
  //
  // The validateIpAddress() function is an auxilary function that validates
  // an IP address
  //
  // @param ipAddress     a string representing an IP address
  //
  // @returns                 true if the string is a valid IP address or
  //                          false otherwise
  //
  validateIpAddress: function (ipAddress) {
    if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipAddress)) {
      return (true)
    } else {
      return (false)
    }
  },
  //
  // The validateDomainName() function is an auxilary function that validates
  // a domain name
  //
  // @param domain            a string representing a domain name
  //
  // @returns                 true if the string is a valid domain name or
  //                          false otherwise
  //
  validateDomainName: function (domain) {
    var re = new RegExp(/^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/);
    return domain.match(re);
  }
};

switch (sys.argv[1]) {
  case 'deploySandboxCluster':
    ic.deploySandboxCluster(parseInt(sys.argv[2]), sys.argv[3]);
    break;

  case 'prepareLocalInstance':
    ic.prepareLocalInstance(sys.argv[2], sys.argv[3], parseInt(sys.argv[4]), sys.argv[5], sys.argv[6]);
    break;

  case 'createProductionCluster':
    ic.createProductionCluster(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], parseInt(sys.argv[6]));
    break;

  case 'addLocalInstanceToCluster':
    ic.addLocalInstanceToCluster(sys.argv[2], sys.argv[3], sys.argv[4], parseInt(sys.argv[5]), sys.argv[6], sys.argv[7], parseInt(sys.argv[8]));
    break;
}
