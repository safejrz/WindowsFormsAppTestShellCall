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
    static string _shellExeFilePath = @"C:\temp\innodbclusteradmin\bin\mysqlsh.exe";
    static string _shellBinFolderPath = @"C:\temp\innodbclusteradmin\bin\";
    static int _lastErrorCode;
    static string _innoDBClusterUri;

    public Form1()
    {
      InitializeComponent();
    }

    private void Form1_Load(object sender, EventArgs e)
    {
      GetLocalIPAddress();
    }

    /// <summary>
    /// Gets the local ip address and sets the Settings option for it.
    /// </summary>
    /// <returns></returns>
    /// <exception cref="System.Exception">Local IP Address Not Found!</exception>
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

    private void button1_Click(object sender, EventArgs e)
    {
      runCMDAsAdmin(string.Format(@"--no-wizard --file C:\Temp\ic.js prepareLocalInstance dba 1234 3306 1234 C:\ProgramData\MySQL\MySQL Server 5.7\my.ini"));
      runCMDAsAdmin(string.Format(@"--no-wizard --file C:\Temp\ic.js createProductionCluster devCluster dba 1234 {0} 3306", _innoDBClusterUri));
    }

    private void button2_Click(object sender, EventArgs e)
    {
      runCMDAsAdmin(string.Format(@"--no-wizard --file C:\Temp\ic.js prepareLocalInstance dba 1234 3306 1234 C:\ProgramData\MySQL\MySQL Server 5.7\my.ini"));
      runCMDAsAdmin(string.Format(@"--no-wizard --file C:\Temp\ic.js addLocalInstanceToCluster dba 1234 devCluster 3306 1234 {0} 3306", _innoDBClusterUri));
    }

    private string runCMDAsAdmin(string args)
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
  }
}
