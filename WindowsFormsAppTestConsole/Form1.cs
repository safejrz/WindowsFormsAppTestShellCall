using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;

namespace WindowsFormsAppTestConsole
{
  public partial class Form1 : Form
  {
    #region Form Secondary Methods
    public Form1() { InitializeComponent(); }
    private void Form1_Load(object sender, EventArgs e) { GetLocalIPAddress(); }
    public void GetLocalIPAddress()
    {
      if (!string.IsNullOrEmpty(_innoDBClusterUri)) return;

      if (!System.Net.NetworkInformation.NetworkInterface.GetIsNetworkAvailable())
      {
        MessageBox.Show("This computer has no network connection.");
        return;
      }

      var host = Dns.GetHostEntry(Dns.GetHostName());
      foreach (var ip in host.AddressList)
      {
        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
          _innoDBClusterUri = ip.ToString();
          return;
        }
      }

      MessageBox.Show("Local IP Address not found.");
    }
    #endregion

    #region Fields and Variables
    static string _shellExeFilePath = @"C:\temp\innodbclusteradmin\bin\mysqlsh.exe";
    static string _shellBinFolderPath = @"C:\temp\innodbclusteradmin\bin\";

    static int _lastErrorCode;
    static string _innoDBClusterUri;
    static string clusterAdmin = "dba";
    static string clusterAdminPassword = "1234";
    static string clusterInstanceHostname = "devCluster";
    static string clusterInstancePort = "3306";
    static string localRootPassword = "1234";
    static string localInstancePort = "3306";
    static string cnfPath = @"C:\ProgramData\MySQL\MySQL Server 5.7\my.ini";
    static string _icJsFileDestinationPath = @"C:\Temp\ic.js";

    #region Repeated variables with different identifiers
    public static string rootPassword { get { return localRootPassword; } }
    public static string clusterName { get { return clusterInstanceHostname; } }
    public static string seedInstanceHostname { get { return _innoDBClusterUri; } }
    public static string localInstanceHostname { get { return _innoDBClusterUri; } }
    public static string seedInstancePort { get { return localInstancePort; } }
    #endregion

    #endregion

    #region Main Methods
    // -------------------------------NOTE!! All other required files to unzip tools are located in the OtherFiles folder at the project root level!---------------!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    private void button1_Click(object sender, EventArgs e)
    {
      //TODO: Run this method as Admin
      // prepareLocalInstance: function (clusterAdmin, clusterAdminPassword, localInstancePort, rootPassword, cnfPath)
      runCMD(string.Format(@"--no-wizard --file {0} prepareLocalInstance {1} {2} {3} {4} {5}", _icJsFileDestinationPath, clusterAdmin, clusterAdminPassword, localInstancePort, rootPassword, cnfPath));

      MessageBox.Show("Restart your server now (manually)");

      // createProductionCluster: function(clusterName, clusterAdmin, clusterAdminPassword, seedInstanceHostname, seedInstancePort)
      runCMD(string.Format(@"--no-wizard --file {0} createProductionCluster {1} {2} {3} {4} {5}", _icJsFileDestinationPath, clusterName, clusterAdmin, clusterAdminPassword, seedInstanceHostname, seedInstancePort));
    }

    private void button2_Click(object sender, EventArgs e)
    {
      //TODO: Run this method as Admin
      //  prepareLocalInstance: function (clusterAdmin, clusterAdminPassword, localInstancePort, rootPassword, cnfPath)
      runCMD(string.Format(@"--no-wizard --file {0} prepareLocalInstance {1} {2} {3} {4} {5}", _icJsFileDestinationPath, clusterAdmin, clusterAdminPassword, localInstancePort, rootPassword, cnfPath));

      MessageBox.Show("Restart your server now (manually)");

      // addLocalInstanceToCluster: function (clusterAdmin, clusterAdminPassword, clusterInstanceHostname, clusterInstancePort, localRootPassword, localInstanceHostname, localInstancePort)
      runCMD(string.Format(@"--no-wizard --file {0} addLocalInstanceToCluster {1} {2} {3} {4} {5} {6} {7}", _icJsFileDestinationPath, clusterAdmin, clusterAdminPassword, clusterInstanceHostname, clusterInstancePort, localRootPassword, localInstanceHostname, localInstancePort));
    }

    private string runCMD(string args)
    {
      ProcessStartInfo processStartInfo = new ProcessStartInfo(_shellExeFilePath);
      processStartInfo.RedirectStandardInput = true;
      processStartInfo.RedirectStandardOutput = true;
      processStartInfo.RedirectStandardError = true;
      processStartInfo.UseShellExecute = false;
      processStartInfo.WorkingDirectory = Path.Combine(_shellBinFolderPath);
      processStartInfo.Arguments = args;
      processStartInfo.CreateNoWindow = true;
      Process process = Process.Start(processStartInfo);
      _lastErrorCode = 0;
      int pid = process.Id;
      if (process != null)
      {
        StringBuilder sbErr = new StringBuilder();
        StringBuilder sbOut = new StringBuilder();
        process.OutputDataReceived += //process_OutputDataReceived;
                (sender, e) =>
                {
                  sbOut.AppendLine(e.Data);
                };
        process.ErrorDataReceived += //process_ErrorDataReceived;
            (sender, e) =>
            {
              sbErr.AppendLine(e.Data);
            };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        process.StandardInput.Close();

        while (!process.WaitForExit(3000))
        {
          if (Process.GetProcessById(pid) != null)
            continue;
        }
        process.Dispose();

        if (!sbOut.ToString().Contains("ERROR"))
          return sbOut.ToString();
        else
        {
          _lastErrorCode = process.ExitCode != 0 ? process.ExitCode : -1;
          return sbErr.ToString();
        }
      }

      throw new Exception("InnoDB Cluster Admin cannot run.");
    }
    #endregion
  }
}
